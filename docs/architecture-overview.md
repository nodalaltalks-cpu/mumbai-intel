# NoDalalTalks — Architecture Overview

## Tech stack

- **Framework**: Next.js 16 (App Router, Server Components + Server Actions, Turbopack build).
- **Database**: Neon Postgres, accessed via Prisma 7 through `@prisma/adapter-neon`'s **HTTP adapter** (`PrismaNeonHttp`) — every query is a stateless fetch request, not a persistent connection. This is a load-bearing architectural constraint: **the HTTP adapter does not support interactive transactions** (`$transaction`, `createMany`, `upsert` all throw `"Transactions are not supported in HTTP mode"`). Every multi-row write in this codebase is therefore either a single-row `create`/`update`/`delete`, or `updateMany`/`deleteMany` (which don't require a transaction), or a manual loop of single-row writes.
- **Media**: Cloudinary (images as `image` resource type, brochures/documents as `raw` resource type).
- **Email**: Resend (password reset emails).
- **Auth**: hand-rolled session tokens (`lib/auth/token.ts`, `lib/public-auth/token.ts`) in an HTTP-only cookie, verified in `proxy.ts` (page-level gate) and independently in every Server Action (`requireMutateSession`/`requireAdminSession`/etc.) since Server Actions are their own POST endpoints and aren't covered by the page-level matcher.
- **Deployment**: Vercel, GitHub-integration auto-deploy on push to `main`. `vercel.json` defines a daily cron (`/api/cron/ingest`, 03:00).
- **Maps**: Leaflet.
- **Rich text**: Tiptap (project/locality/builder description fields).

## Module map

```
app/
  (public pages)              → Server Components, force-dynamic, read via lib/queries/*
  admin/(dashboard)/*         → Server Components, read via lib/admin-queries.ts, mutate via lib/actions/*
  api/                        → the only 3 real HTTP route handlers (OAuth + cron)
lib/
  actions/*.ts                → "use server" — the entire write API surface, one file per entity
  queries/*.ts                → public-site reads
  admin-queries.ts            → admin-side reads (wrapped in safeQuery for graceful degradation)
  analytics/*                 → deterministic scoring/trend calculators (AnalyticsService)
  ingestion/*                 → connector framework + CSV/JSON file import + duplicate matching
  auth/*  public-auth/*       → two independent session systems
  cache.ts                    → the single revalidation surface ("Automatic Update Engine")
  audit.ts                    → the single AuditLog write path
  cloudinary.ts               → the single media upload/delete surface
  infra-linking.ts            → Project/Locality/Transaction ↔ InfraAsset proximity service
  map/*                       → clustering + shared map types
prisma/schema.prisma          → single source of truth for every table (see data-dictionary.md)
```

Public pages never import from `lib/actions/*` for reads (they use `lib/queries/*`), and admin pages never hand-roll a Prisma query inline (they use `lib/admin-queries.ts`) — this separation is what makes the Module Contracts in `docs/governance-standards.md` enforceable.

## Database schema & relationships (summary — full detail in `docs/data-dictionary.md`)

Three structural layers:
1. **Geo hierarchy**: `Country → State → City → Zone → Locality → MicroMarket`, multi-tenant by design (Mumbai is `City.isLive = true`; expansion is new rows, not new tables).
2. **Catalog**: `Builder ⇄ Project → Locality/MicroMarket`, plus Project's own child tables (images, configurations, specs, documents, timeline, FAQs, sections, amenities).
3. **Market data**: `Transaction` (source-agnostic — see "swap-ready" note below), `PriceHistoryPoint`, `ProjectMetric`, `InvestmentNote`.

Cutting across all three: `InfraAsset`/`ProjectInfra` (infrastructure proximity), the ingestion substrate (`IngestSource`/`IngestBatch`/`IngestLogEntry`/`IngestStagingRecord`), and identity (`User`/`AuditLog` for admin, `PublicUser`/`SavedProject`/`PublicPasswordResetToken` for public).

## The provenance contract

Every fact-bearing table carries a `DataSource` enum value (`OFFICIAL_GOVERNMENT`/`BUILDER_INFORMATION`/`MANUALLY_VERIFIED`/`AI_GENERATED`/`USER_SUBMITTED`/`EXTERNAL_OPEN_DATA`), rendered as a visible badge wherever that fact appears publicly. This is the platform's stated design law: **nothing renders whose origin can't be named.**

## The swap-ready pattern (manual now, automated later, same schema)

`Transaction` is the canonical example: a hand-curated row and a future IGR-ingested row are the exact same shape, differing only in `dataSource`, `sourceRef`, `ingestBatchId`, and `confidence`. The `@@unique([dataSource, sourceRef])` constraint makes future automated ingestion idempotent without ever touching manually-entered rows. `InfraAsset` already proves this pattern works in production — it started manually-curated and now also receives real, automated OpenStreetMap data via the exact same table, distinguished only by `sourceRef`/`dataSource`.

---

## Import / Ingestion pipeline

**Entry points**: a live connector (`lib/ingestion/connectors/osmLocalityInfra.ts`, triggered manually from `/admin/data-sync` or on the daily Vercel Cron) and a file-upload path (`lib/ingestion/fileImportRunner.ts`, CSV/JSON, triggered from `/admin/data-sync/import`).

**Flow** (`lib/ingestion/runner.ts`):
1. Reap any batch stuck in `"running"` for >15 minutes (crashed/timed-out run) so it doesn't wedge future runs.
2. Enforce **single-flight per source** — reject a new run if one for the same `sourceKey` is already `"running"`, since two concurrent runs would race on the idempotency unique constraint.
3. Create an `IngestBatch` row (`status: "running"`).
4. Fetch all candidates from the connector, then batch-read existing `sourceRef`s and existing unsourced rows **once** (not once per candidate) — a deliberate concession to the Neon HTTP adapter's per-request latency at scale.
5. Per candidate: skip if `sourceRef` already exists (idempotent re-run); else check for a possible duplicate against manually-curated rows (`lib/ingestion/duplicateMatch.ts`) — if found, write an `IngestStagingRecord` for human review instead of writing directly; else create the row directly, tagged with the connector's `dataSource` (e.g. `EXTERNAL_OPEN_DATA` for OSM).
6. Cap writes per run (`MAX_WRITES_PER_RUN = 150`) — anything beyond the cap is deferred to the next scheduled run, never lost (idempotent via `sourceRef`).
7. Every outcome (created/skipped/staged/failed) gets an `IngestLogEntry`; the batch is marked `"success"` or `"failed"` at the end.

**The Review Queue** (`/admin/data-sync/review`) is the human-in-the-loop step for anything staged in step 5, plus every row from a CSV/JSON Project import (file imports **always** stage — they never write directly, unlike the OSM connector which only stages on a detected duplicate). An admin approves (applies the payload via `buildProjectData()`, the same field-mapping the manual form uses) or rejects (no write) each record, individually or in bulk.

## Analytics engine

**Status**: deterministic, formula-based — not a machine-learning model. `lib/analytics/index.ts` re-exports five domain calculators (`projectAnalytics`, `developerAnalytics`, `localityAnalytics`, `marketAnalytics`, `transactionAnalytics`) under one `AnalyticsService` namespace. Each takes plain data already fetched by a query function (e.g. `getLocalityIntelligence` fetches recent/prior transaction counts and published-project statuses, then hands them to `LocalityAnalyticsService.calculateIntelligence`) and returns a typed result — no calculator ever queries the database itself, keeping them independently testable (see Testing Standards).

`ProjectMetric` and `InvestmentNote` rows tagged `AI_GENERATED` are the intended future home for genuinely model-computed output; today they hold either deterministic-calculator output or hand-curated admin input using that tag as a placeholder convention.

## Review workflow

Two distinct things share the word "review" in this codebase, documented separately in `docs/feature-registry.md` to avoid confusion:
1. **Data Import Review Queue** (`IngestStagingRecord` + `/admin/data-sync/review`) — admin approval of staged import candidates. This is what "Reviews" means everywhere in this codebase today.
2. **User-facing project/builder reviews** — not built. No `ProjectReview`/`BuilderReview` table exists.

## Media pipeline

Upload: `lib/cloudinary.ts`'s `uploadImageFile`/`uploadDocumentFile` (server-side, validates MIME type and size — 8MB images, 15MB PDFs — before calling Cloudinary's upload stream). The returned `secure_url` is what gets stored in `ProjectImage.url`/`Builder.logoUrl`/etc. — Cloudinary is the only binary store; Postgres never holds image bytes.

Deletion: only ever triggered by a **permanent** delete (never a soft Trash), and always **DB-row-delete-first, then Cloudinary-cleanup**: the database row is deleted (or the bulk `deleteMany`/loop completes) before any Cloudinary `destroy` call runs, so a database failure never touches remote media, and a Cloudinary failure (logged via `console.error`, never thrown) never leaves the database inconsistent — the DB is already the source of truth by the time cleanup runs. `deleteProjectMediaAssets` (`lib/actions/projects.ts`) and `deleteBuilderMediaAssets` (`lib/actions/builders.ts`) are the two implementations of this pattern; any future media-bearing entity should copy it exactly.

## Search architecture

Two independent, unrelated search implementations (see `docs/feature-registry.md` → Search for full detail):
- **Public search** (`lib/queries/index.ts`'s `searchPublic`, called via `lib/actions/public-search.ts`): unauthenticated, simple `contains`/`insensitive` matching across Project/Builder/Locality name fields.
- **Admin global search** (`lib/admin-queries.ts`'s `globalSearch`, called via `lib/actions/search.ts`): requires a signed-in admin session, same matching strategy, scoped to the admin dashboard's search bar.
- **Recent searches**: purely client-side, `localStorage`-backed (`lib/recent-searches.ts`), no server persistence — a `useSyncExternalStore` hook shared by every public page's search UI.

There is no full-text search index (e.g. Postgres `tsvector`, Elasticsearch, Algolia) — matching is Prisma's `contains`/`mode: "insensitive"`, adequate at current catalog size. A future full-text engine would replace `searchPublic`'s internals without changing its call signature.

## Caching strategy ("the Automatic Update Engine")

Every public page renders with `export const dynamic = "force-dynamic"` — there is **no server-side Full Route Cache to go stale**, because every navigation re-queries Postgres directly. This is the reason "the website updates automatically" is true by construction, not by a caching layer that needs invalidating correctly.

What `lib/cache.ts`'s `revalidateProject`/`revalidateBuilder`/`revalidateLocality`/`revalidateTransaction`/`revalidateInfra` actually buy, given the above:
1. Invalidate the **client-side Router Cache**, so an admin who just saved an edit and gets redirected back to a list doesn't see a stale cached RSC payload.
2. **Future-proofing**: if server-side caching is ever added to a route (e.g. `revalidate: 60` on a report page), these five functions are the one place that needs to stay correct — every mutation already calls the right one(s) for every page that could show that entity's data.

Every mutation calls exactly one of these five functions; no action file calls `revalidatePath` directly (Module Contracts, `docs/governance-standards.md`).

## Permission model

Two entirely separate identity systems (see Authentication in the Feature Registry): Founder Admin (`User`/`UserRole`: `ADMIN`/`EDITOR`/`VIEWER`) and Public Site (`PublicUser`, no roles — just an authenticated visitor).

Admin-side guard functions (`lib/auth/guard.ts`), from least to most restrictive:
- `requireAnySession()` — any signed-in admin-side user, any role.
- `requireSession()` — page-level guard (redirects to `/login` if absent), used by every `app/admin/(dashboard)/*/page.tsx`.
- `requireMutateSession()` — `ADMIN` or `EDITOR`; gates Create/Edit/Autosave/Duplicate/Feature-toggle actions.
- `requireAdminSession()` — `ADMIN` only; gates Publish/Unpublish/Archive/Trash/Restore/Permanent-Delete/Bulk-* actions across every entity, plus user management and ingestion-source enable/disable.

`proxy.ts` is a **page-level** gate only (`matcher: ["/admin/:path*"]`) — it redirects an unauthenticated request away from any `/admin/*` page, but does **not** protect Server Actions, since a Server Action is its own POST endpoint invocable independent of which page rendered the form. This is why every mutating action independently calls one of the four guard functions above as its first line — the guard, not the route, is the actual security boundary.
