# NoDalalTalks — Feature Registry

This is the official architecture reference for what exists, what it depends on, and where a future module should plug in. Every entry is grounded in the actual codebase as of this writing — nothing here is aspirational unless explicitly marked **[FUTURE]**.

A note on "API Endpoints": this app is built almost entirely on **Next.js Server Actions** (`"use server"` functions in `lib/actions/*.ts`), not a REST/JSON API layer. There are only three real HTTP route handlers in the whole app (`app/api/auth/google/route.ts`, `app/api/auth/google/callback/route.ts`, `app/api/cron/ingest/route.ts`). So for most features, "API Endpoints" below lists the relevant Server Actions — these *are* this app's API layer, just invoked via RSC form actions/transitions instead of `fetch()`.

---

## Projects

**Purpose**: The core catalog entity — residential/commercial project listings, the platform's primary product.

**Dependencies**: Locality (required parent), Builder (optional parent), City (primary-city scoping), Amenity (tags), InfraAsset (via ProjectInfra proximity).

**Database Tables**: `Project`, `ProjectImage`, `Configuration`, `ProjectAmenity`, `ProjectSpecification`, `ProjectDocument`, `ProjectTimelineEvent`, `ProjectFaq`, `ProjectSection`, `ProjectInfra`, `ProjectMetric`, `PriceHistoryPoint`, `InvestmentNote`, `SavedProject`.

**API Endpoints (Server Actions)**: `lib/actions/projects.ts` (create/update/autosave/duplicate/publish/archive/trash/restore/permanent-delete/bulk-*), `lib/actions/configurations.ts`, `lib/actions/project-specifications.ts`, `lib/actions/project-documents.ts`, `lib/actions/project-timeline.ts`, `lib/actions/project-faqs.ts`, `lib/actions/project-sections.ts`, `lib/actions/project-infra.ts`, `lib/actions/investment-notes.ts`, `lib/actions/images.ts`, `lib/actions/brochure.ts`.

**Frontend Pages**: Public — `/projects`, `/projects/[slug]`, homepage featured rail. Admin — `/admin/projects`, `/admin/projects/new`, `/admin/projects/[id]/edit`, `/admin/projects/[id]/preview`, `/admin/trash` (Projects tab).

**Services Used**: `lib/queries/index.ts` (public reads), `lib/admin-queries.ts` (admin reads), `lib/project-data.ts` (shared zod schema + field-mapping, reused by both the admin form and the ingestion approval path), `lib/cache.ts` (`revalidateProject`), `lib/audit.ts` (`logAudit`), `lib/infra-linking.ts` (`syncProjectNearbyInfra`), `lib/cloudinary.ts` (images/brochure).

**Permissions**: Create/Edit/Duplicate/Autosave — EDITOR or ADMIN (`requireMutateSession`). Publish/Archive/Trash/Restore/Permanent-Delete/Bulk-* — ADMIN only (`requireAdminSession`).

**Future Extension Points**: `sourceRef`/`ingestBatchId` already support a live RERA/IGR connector writing directly to this table (see Data Dictionary). `ProjectSection` is an open-ended rich-text block system for new narrative content without new columns. `ProjectMetric` is the slot for genuinely model-computed scores.

---

## Builders

**Purpose**: Developer/company profiles — trust signals, portfolio, history.

**Dependencies**: Amenity (tags). Referenced by Project (optional).

**Database Tables**: `Builder`, `BuilderAmenity`, `BuilderImage`, `BuilderTimelineEvent`, `BuilderScoreSnapshot`.

**API Endpoints (Server Actions)**: `lib/actions/builders.ts` (full CRUD + Trash/restore/permanent-delete/bulk-*, including Cloudinary media cleanup on permanent delete), `lib/actions/builder-images.ts`.

**Frontend Pages**: Public — `/builders`, `/builders/[slug]`, `/reports/developers/[slug]`. Admin — `/admin/builders`, `/admin/builders/new`, `/admin/builders/[id]/edit`, `/admin/builders/[id]/preview`, `/admin/trash` (Builders tab).

**Services Used**: `lib/queries/index.ts`, `lib/admin-queries.ts`, `lib/cache.ts` (`revalidateBuilder`), `lib/audit.ts`, `lib/cloudinary.ts`, `lib/analytics/developerAnalytics.ts` (portfolio breakdown, trust leaderboard — deterministic, not ML).

**Permissions**: same split as Projects — Create/Edit/Duplicate/Feature-toggle are EDITOR-accessible; Publish/Archive/Trash/Restore/Permanent-Delete/Bulk-* are ADMIN-only.

**Future Extension Points**: a Builder-specific CSV/JSON bulk import (mirroring the Project one) is the natural next ingestion connector — same staging/review pattern, no new tables needed.

---

## Transactions

**Purpose**: Registered/recorded sale, resale, and lease records — the market-data backbone. Deliberately source-agnostic so a future IGR feed is a drop-in, not a rebuild.

**Dependencies**: Locality (required), Project (optional).

**Database Tables**: `Transaction`, `PriceHistoryPoint` (project-level monthly aggregate, conceptually related).

**API Endpoints (Server Actions)**: `lib/actions/transactions.ts` (create/update/trash/restore/permanent-delete/bulk-*).

**Frontend Pages**: Public — `/transactions`, `/transactions/[id]`, `/reports/transactions`, `/market-data`, transaction layers on `/map` and Project/Locality detail pages. Admin — `/admin/transactions`, `/admin/transactions/new`, `/admin/transactions/[id]/edit`, `/admin/trash` (Transactions tab).

**Services Used**: `lib/queries/transactions.ts` (public filtering/pagination/stats), `lib/admin-queries.ts`, `lib/analytics/transactionAnalytics.ts` (stats, monthly trend, configuration/property-type distribution), `lib/cache.ts` (`revalidateTransaction`), `lib/audit.ts`.

**Permissions**: Create/Edit stay EDITOR-accessible (Transaction has no publish/archive gate — market data is live immediately). Trash/Restore/Permanent-Delete/Bulk-* are ADMIN-only.

**Future Extension Points**: this is *the* IGR integration point — `dataSource: OFFICIAL_GOVERNMENT` + `sourceRef` = registry document number + `ingestBatchId`, written by a new `lib/ingestion/connectors/igrMaharashtra.ts`, with zero schema or query-shape change.

---

## Localities

**Purpose**: Neighborhood entities — editorial content, curated market snapshot, insight scores, connectivity notes.

**Dependencies**: City, Zone (optional). Parent to Project, Transaction, MicroMarket.

**Database Tables**: `Locality`, `LocalityAmenity`, `LocalityImage`, `LocalityAlias`, `MicroMarket`.

**API Endpoints (Server Actions)**: `lib/actions/localities.ts` (full CRUD + Trash/restore/permanent-delete/bulk-*), `lib/actions/locality-images.ts`, `lib/actions/micromarkets.ts`.

**Frontend Pages**: Public — `/localities`, `/localities/[slug]`, `/reports/areas/[slug]`. Admin — `/admin/localities`, `/admin/localities/new`, `/admin/localities/[id]/edit`, `/admin/localities/[id]/preview`, `/admin/trash` (Localities tab).

**Services Used**: `lib/queries/index.ts`, `lib/admin-queries.ts`, `lib/analytics/localityAnalytics.ts` (demand/supply indicators), `lib/infra-linking.ts` (`getLocalityNearbyInfra`), `lib/cache.ts` (`revalidateLocality`), `lib/audit.ts`.

**Permissions**: same split as Project/Builder.

**Future Extension Points**: `LocalityAlias` is reserved for a future automated matcher (IGR spelling variants → canonical locality); not consumed by any query yet — a genuine gap, not a hidden feature.

---

## Maps

**Purpose**: Interactive city map — locality/project markers, transaction density, infrastructure layer.

**Dependencies**: Locality, Project, Transaction, InfraAsset (all read-only on this page — Maps has no tables of its own).

**Database Tables**: none owned; reads `Locality`, `Project`, `Transaction`, `InfraAsset`.

**API Endpoints (Server Actions)**: none dedicated — consumes `lib/queries/map.ts` directly as server-rendered data (no client-side fetch).

**Frontend Pages**: `/map`.

**Services Used**: `lib/queries/map.ts`, `lib/map/cluster.ts` (marker clustering), `lib/map/types.ts`, Leaflet (`leaflet` + `react-leaflet`-style usage) for rendering.

**Permissions**: fully public, read-only.

**Future Extension Points**: `lib/map/cluster.ts` is already a standalone clustering utility — any future entity that needs map placement (e.g. a "Consultation Marketplace" agent pin) can reuse it without new map infrastructure.

---

## Analytics

**Purpose**: Deterministic, formula-based intelligence — demand/health scores, price trends, portfolio breakdowns, market snapshots. **Important distinction**: everything under `lib/analytics/*` today is arithmetic over stored facts, not a machine-learning model — "AI_GENERATED" tags on some tables (e.g. `ProjectMetric`, `InvestmentNote`) mark the *intended future* home for real model output, not a claim that a model runs today.

**Dependencies**: Project, Builder, Locality, Transaction (reads across all of them).

**Database Tables**: reads from `Project`, `Transaction`, `Builder`, `BuilderScoreSnapshot`, `Locality`; writes to `ProjectMetric` (partially — see Data Dictionary note on live-vs-stored).

**API Endpoints (Server Actions)**: none dedicated — analytics functions are called directly from Server Components (`lib/analytics/index.ts` re-exports `projectAnalytics`, `developerAnalytics`, `localityAnalytics`, `marketAnalytics`, `transactionAnalytics`).

**Frontend Pages**: `/reports`, `/reports/market`, `/reports/areas/[slug]`, `/reports/developers/[slug]`, `/reports/projects/[slug]`, `/reports/transactions`, `/insights`, `/admin/analytics`, `/admin/market-intelligence`, `/admin/price-trends`.

**Services Used**: `AnalyticsService` (the umbrella export in `lib/analytics/index.ts`), `lib/admin-queries.ts` (aggregation queries feeding these calculators).

**Permissions**: public reports are read-only/public; admin analytics pages require any authenticated session (`requireSession`).

**Future Extension Points**: `ProjectMetric.methodologyVersion` and `BuilderScoreSnapshot.methodologyVersion` are the seams for swapping in a real ML model later without invalidating historical scores.

---

## Search

**Purpose**: Two independent search surfaces — a public, unauthenticated site search, and an admin global search (Projects/Builders/Localities by name).

**Dependencies**: Project, Builder, Locality (name/slug lookups).

**Database Tables**: none owned; reads `Project`, `Builder`, `Locality`.

**API Endpoints (Server Actions)**: `lib/actions/public-search.ts` (`publicSearchAction` — public, no auth), `lib/actions/search.ts` (`globalSearchAction` — requires `requireSession`).

**Frontend Pages**: public site header search (all public pages), `/admin` global search bar.

**Services Used**: `lib/queries/index.ts` (`searchPublic`), `lib/admin-queries.ts` (`globalSearch`), `lib/recent-searches.ts` (client-side, `localStorage`-backed recent-search history — no server persistence, no database table).

**Permissions**: public search is open; admin search requires any signed-in session.

**Future Extension Points**: `lib/recent-searches.ts`'s `localStorage` pattern is the client-side integration point for any future "recently viewed" feature; a server-persisted version (per `PublicUser`) would need one new table.

---

## Reviews (Data Import Review Queue)

**Purpose**: **Not** a user-facing project/builder review-and-rating system — no such feature exists in this platform today. "Reviews" here refers to the **admin Data Import Review Queue**: staged records from CSV/JSON/connector imports that need a human decision (approve/reject/merge) before they touch the live catalog.

**Dependencies**: IngestBatch (parent), Project/InfraAsset (the entities a staged record can become).

**Database Tables**: `IngestStagingRecord`, `IngestBatch`, `IngestLogEntry`.

**API Endpoints (Server Actions)**: `lib/actions/ingestion.ts` (`approveStagingRecordAction`, `rejectStagingRecordAction`, `bulkApproveStagingRecordsAction`, `bulkRejectStagingRecordsAction`).

**Frontend Pages**: `/admin/data-sync/review`.

**Services Used**: `lib/ingestion/duplicateMatch.ts` (proposes merges vs. new-row candidates), `lib/project-data.ts` (`buildProjectData` — reused so approved imports map fields identically to the manual admin form).

**Permissions**: EDITOR or ADMIN (`requireMutateSession`) can approve/reject.

**Future Extension Points**: **[FUTURE]** a genuine public review/rating system (users rating Projects or Builders) would need new tables (`ProjectReview`, `BuilderReview` or similar) and is not yet designed — flagging explicitly so it isn't confused with the existing Review Queue.

---

## Media

**Purpose**: Image and document upload/management via Cloudinary, across Project, Builder, and Locality.

**Dependencies**: Cloudinary (external service, credentials in env).

**Database Tables**: `ProjectImage`, `ProjectDocument`, `BuilderImage`, `LocalityImage` (all store the Cloudinary `secure_url`, not the binary).

**API Endpoints (Server Actions)**: `lib/actions/images.ts`, `lib/actions/brochure.ts`, `lib/actions/builder-images.ts`, `lib/actions/locality-images.ts`, `lib/actions/upload.ts`.

**Frontend Pages**: every admin edit page's uploader components (`ImageUploader`, `BrochureUploader`, `BuilderGalleryUploader`, `LocalityGalleryUploader`, `DocumentsManager`); `/admin/images` (cross-entity image browser).

**Services Used**: `lib/cloudinary.ts` (`uploadImageFile`, `uploadDocumentFile`, `deleteImageByPublicId`, `deleteDocumentByPublicId`, `publicIdFromUrl`).

**Permissions**: EDITOR or ADMIN can upload/reorder; permanent deletion of a parent entity (ADMIN-only) is what actually triggers Cloudinary asset deletion, via each entity's `delete{Entity}MediaAssets` helper.

**Future Extension Points**: the DB-delete-first-then-Cloudinary-cleanup pattern (`deleteProjectMediaAssets`, `deleteBuilderMediaAssets`) is the template any future media-bearing entity should copy verbatim.

---

## Reports

**Purpose**: Public-facing, SEO-oriented analytical report pages — Market Report, per-Locality Area Report, per-Builder Developer Report, per-Project Project Report, Transaction Report.

**Dependencies**: Analytics feature (reads its calculators directly); Project/Builder/Locality/Transaction.

**Database Tables**: reads only, no owned tables.

**API Endpoints (Server Actions)**: none — server-rendered directly from `lib/queries/reports.ts` and `lib/analytics/*`.

**Frontend Pages**: `/reports`, `/reports/market`, `/reports/areas/[slug]`, `/reports/developers/[slug]`, `/reports/projects/[slug]`, `/reports/transactions`.

**Services Used**: `lib/queries/reports.ts`, `AnalyticsService`, `app/components/charts/*` (PriceTrendChart, TransactionCharts).

**Permissions**: fully public.

**Future Extension Points**: each report page is already SSR + `force-dynamic`, so any new report just needs a new route + query function — no shared-layer change.

---

## Authentication

**Purpose**: Two entirely separate authentication systems by design — Founder Admin (`User`/`UserRole`) and Public Site (`PublicUser`/`AuthProvider`). Never share a table, never share a login page.

**Dependencies**: none (foundational).

**Database Tables**: `User`, `AuditLog` (admin side); `PublicUser`, `SavedProject`, `PublicPasswordResetToken` (public side).

**API Endpoints (Server Actions + routes)**: `lib/actions/auth.ts` (admin login/logout), `lib/actions/public-auth.ts` (signup/login/logout/forgot-password/reset-password), `app/api/auth/google/route.ts` + `app/api/auth/google/callback/route.ts` (Google OAuth redirect flow — the only real HTTP routes in the auth system).

**Frontend Pages**: `/login` (unified public+admin login with role-based redirect), `/signup`, `/forgot-password`, `/reset-password`, `/account`. `/admin/login` is kept only as a redirect stub for old bookmarks.

**Services Used**: `lib/auth/{guard,password,session,token}.ts` (admin), `lib/public-auth/{google,guard,session,token}.ts` (public), `lib/email.ts` (Resend, password-reset emails), `lib/rate-limit.ts` (login/reset rate limiting), `proxy.ts` (page-level `/admin/*` gate — Server Actions are NOT covered by this and self-check via `requireMutateSession`/`requireAdminSession`).

**Permissions**: `requireSession` (any signed-in role, admin side), `requireMutateSession` (ADMIN/EDITOR), `requireAdminSession` (ADMIN only), `requireAnySession` (any admin-side role, no mutate check).

**Future Extension Points**: `PublicUser.phone` + nullable `passwordHash` are already shaped for a `MOBILE_OTP` `AuthProvider` — additive, no migration.

---

## Admin CMS

**Purpose**: The Founder Admin dashboard — full lifecycle management (Create/Edit/Publish/Archive/Trash/Restore/Permanent-Delete/Bulk-*/Duplicate) for Project, Builder, Locality, Transaction, plus Users, Media, Data Sync, Analytics, and Trash.

**Dependencies**: every catalog/market-data feature above; Authentication (gates everything).

**Database Tables**: touches nearly every table in the schema (see Data Dictionary); uniquely owns `AuditLog`, `IngestSource`/`IngestBatch`/`IngestLogEntry`/`IngestStagingRecord`.

**API Endpoints (Server Actions)**: all of `lib/actions/*.ts` except `public-auth.ts`, `public-search.ts`, `saved-projects.ts`, `contact.ts`.

**Frontend Pages**: everything under `app/admin/(dashboard)/*` — Dashboard, Projects, Builders, Localities, Transactions, Images, Analytics, Market Intelligence, Price Trends, Data Sync (+ Import + Review Queue + batch detail), Users, Settings, Trash.

**Services Used**: `lib/admin-queries.ts`, `lib/audit.ts`, `lib/cache.ts`, `lib/auth/guard.ts`.

**Permissions**: role-gated per action (see each feature's Permissions above and Governance Standards' full matrix).

**Future Extension Points**: the Trash/audit-history/role-gating pattern built for Project/Builder/Locality/Transaction is the template every future admin-managed entity should copy exactly (see Governance Standards, Module Contracts).

---

## Data Ingestion (not in the user's example list, but a major existing feature)

**Purpose**: Automated + bulk-upload data pipeline — the framework behind "Reviews" (Review Queue) above.

**Dependencies**: Project, InfraAsset (current write targets); City (OSM connector scoping).

**Database Tables**: `IngestSource`, `IngestBatch`, `IngestLogEntry`, `IngestStagingRecord`.

**API Endpoints (Server Actions + routes)**: `lib/actions/ingestion.ts`, `app/api/cron/ingest/route.ts` (Vercel Cron trigger, `vercel.json` schedules it daily at 03:00).

**Frontend Pages**: `/admin/data-sync`, `/admin/data-sync/import`, `/admin/data-sync/review`, `/admin/data-sync/batches/[id]`.

**Services Used**: `lib/ingestion/runner.ts` (generic batch runner), `lib/ingestion/connectors/osmLocalityInfra.ts` (live, real connector), `lib/ingestion/connectors/fileImport/*` (CSV/JSON parser, column mapping, row validation), `lib/ingestion/duplicateMatch.ts`, `lib/ingestion/fileImportRunner.ts`.

**Permissions**: trigger/import — EDITOR or ADMIN; enable/disable a source — ADMIN only.

**Future Extension Points**: this is the designated home for a future MahaRERA/IGR connector — same `IngestBatch`/`IngestStagingRecord` substrate, new file under `lib/ingestion/connectors/`.

---

## Future AI **[FUTURE]**

**Purpose**: Genuine model-driven features — investment summaries, chat-based project Q&A, personalized recommendations. Not built today; `InvestmentNote`/`ProjectMetric` rows tagged `AI_GENERATED` are currently hand-curated placeholders, not live model output.

**Dependencies (planned)**: Project, Transaction, Locality data as model context; a hosted LLM provider.

**Database Tables (planned)**: reuses `InvestmentNote`, `ProjectMetric` (already shaped for this); may need a new `AiQuery`/`AiConversation` table for chat-style features.

**Future Extension Points**: `dataSource: AI_GENERATED` + `methodologyVersion` fields already exist precisely so this can land without touching Project/Builder/Locality's own schema.

---

## Future Consultation Marketplace **[FUTURE]**

**Purpose**: Connecting buyers with brokers/consultants — not built today, no tables exist.

**Dependencies (planned)**: PublicUser (buyer identity), Builder/Project (context), a new Consultant/Agent entity.

**Database Tables (planned)**: new — `Consultant`, `ConsultationRequest`, possibly `ConsultantReview` (this would be the platform's first genuine review/rating table).

**Future Extension Points**: should follow the exact Module Contract in Governance Standards — its own tables, its own service layer, integrates with Project/Locality only through existing read queries, never direct joins into another module's write path.

---

## Future Mobile App **[FUTURE]**

**Purpose**: Native/React Native client — not built today.

**Dependencies (planned)**: would consume the same data as the web app; since there is no REST/JSON API layer today (everything is Server Actions bound to React Server Components), a mobile client would need either (a) a new `app/api/v1/*` REST layer following the API Standards doc, or (b) a React Native + Next.js hybrid (e.g. Expo Router sharing the RSC layer) — an architectural decision to make explicitly before starting, not an incremental extension of the current Server Action pattern.

**Future Extension Points**: `lib/queries/*.ts` and `lib/admin-queries.ts` are already the clean read-boundary a REST layer would wrap — the query functions themselves wouldn't need to change, only a thin `app/api/v1/*` route layer calling into them.
