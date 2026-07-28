# Mumbai Intel — Governance Standards

This document is the binding rulebook for every future change to Mumbai Intel. It exists so the platform can keep growing without needing architectural redesign. Where a rule is **already enforced** by the current codebase, that's stated explicitly with a pointer to the enforcing code. Where a rule is a **standard for future work** that the current codebase doesn't yet fully satisfy, that's stated explicitly too — this document does not claim retroactive compliance it can't back up.

---

## 1. Module Contracts

A "module" here means a feature area as defined in `docs/feature-registry.md` (Projects, Builders, Transactions, Localities, Media, Ingestion, etc.).

### Rule: Cannot directly modify another module's database tables without going through the service layer

**Status: enforced today.** Every mutation goes through `lib/actions/*.ts`, which calls the Prisma client itself — there is no cross-module direct-write pattern (e.g. `lib/actions/builders.ts` never writes to `Transaction`). Where one module needs to affect another's data (e.g. deleting a Locality is blocked while Projects/Transactions still reference it), the blocking module reads the other's table via a `count()`/`findMany()` check, never a write.

**Going forward**: a new module must not `prisma.<otherModulesTable>.update(...)` directly. If it needs to affect another module's rows, either (a) call that module's existing action function, or (b) if no suitable action exists, add one to that module's `lib/actions/*.ts` and call it — never inline the write in the new module's file.

### Rule: Must expose clear interfaces

**Status: enforced today** at the Server Action boundary — every `lib/actions/*.ts` export has a typed signature and a typed return (`{ error?: string; ... }` or a redirect). Every `lib/queries/*.ts` and `lib/admin-queries.ts` export returns a typed shape.

**Going forward**: any new module's public surface is its exported action/query functions — internal helpers (like `deleteBuilderMediaAssets` in `lib/actions/builders.ts`) stay unexported (module-private).

### Rule: Must reuse existing services whenever possible

**Status: enforced today**, with concrete examples:
- `buildProjectData()` (`lib/project-data.ts`) is shared verbatim by the admin form (`lib/actions/projects.ts`) and the bulk-import approval path (`lib/actions/ingestion.ts`) — field-mapping logic exists in exactly one place.
- `logAudit()` (`lib/audit.ts`) is the single audit-write path for all 38+ call sites across every action file.
- `revalidateProject`/`revalidateBuilder`/`revalidateLocality`/`revalidateTransaction`/`revalidateInfra` (`lib/cache.ts`) are the single cache-invalidation path — no action file calls `revalidatePath` directly.
- `AnalyticsService` (`lib/analytics/index.ts`) is the single source of every score/trend calculation — no page or component recomputes analytics inline.

**Going forward**: before writing a new calculation, cache-invalidation, or audit call, check `lib/analytics`, `lib/cache.ts`, and `lib/audit.ts` first.

### Rule: Must never duplicate business logic / validation / analytics calculations

**Status: enforced today** via the patterns above (one zod schema per entity in `lib/project-data.ts`/inline in each action file; one `AnalyticsService` namespace per domain).

**Going forward**: if two modules need "the same" validation or calculation, extract it to a shared `lib/` module rather than copying it — exactly how `parseProjectForm`/`buildProjectData` were extracted specifically because both the admin form and the ingestion approval path needed identical logic.

### Rule: Must remain independently testable

**Status: partially enforced by structure, not yet verified by an actual test suite.** Business logic already lives in plain, non-request-scoped modules (`lib/analytics/*`, `lib/project-data.ts`, `lib/ingestion/duplicateMatch.ts`) that *could* be unit-tested without a running server — but as of this writing **no automated test suite exists in this repository** (no `jest`/`vitest`/`playwright` in `package.json`). This is a real gap, tracked in the Testing Standards section below, not a false claim of coverage.

### Rule: Must remain backward compatible

**Status: enforced today** — see Database Migration Policy below; every CMS-phase change (Trash, audit history) was additive, and existing call sites (38 `logAudit()` calls with the old 4-argument signature) continued to compile against the extended function without modification.

---

## 2. API Standards

### Current state (honest baseline)

Today, "the API" for 95% of this app's functionality is **Server Actions**, not a REST/JSON endpoint layer. The only three real HTTP route handlers are:
- `app/api/auth/google/route.ts` / `app/api/auth/google/callback/route.ts` — OAuth redirect flow.
- `app/api/cron/ingest/route.ts` — Vercel Cron trigger, bearer-token authenticated via `CRON_SECRET`.

None of these three implement pagination, sorting, filtering, versioning, or a documented error-response schema, because none of them are resource-collection endpoints — they're a redirect flow and a fire-and-trigger cron hook, respectively. This is accurate today, not a gap to "fix" retroactively.

Server Actions themselves already satisfy several of these standards structurally:
- **Validation**: every mutating action validates input via `zod` before touching Prisma (`lib/project-data.ts`, and inline schemas in each `lib/actions/*.ts`).
- **Authentication**: every mutating action calls `requireMutateSession()`, `requireAdminSession()`, or `requireAnySession()` as its first line (`lib/auth/guard.ts`).
- **Authorization**: role checks are baked into which guard function is called — see the permission matrix in `docs/feature-registry.md` and each entity's actions file.
- **Error Handling**: every mutating action returns `{ error?: string }` on failure via `friendlyPrismaError()` (`lib/actions/errors.ts`), never throws an unhandled exception to the client.
- **Pagination/Filtering/Sorting**: implemented at the query-function level (`getProjectsAdminPaged`, `getPublicTransactionsPaged`, etc.) with `page`/`pageSize`/`sortBy`/filter-object parameters — the convention any new list feature should copy.

### Standard for any future REST/JSON API (e.g. a Mobile App backend, per Feature Registry)

If/when this app adds a real `app/api/v1/*` REST layer (see Future Mobile App in the Feature Registry), every new endpoint must support:

| Concern | Convention |
|---|---|
| Validation | zod schema per endpoint, mirroring the existing Server Action pattern |
| Authentication | Bearer token or session cookie, checked via a shared `requireApiSession()` helper (to be added — do not inline auth checks per-route) |
| Authorization | role check via the existing `lib/auth/guard.ts` functions (do not create parallel role logic) |
| Pagination | `?page=&pageSize=` query params, response includes `{ items, total, page, pageSize, totalPages }` — exactly the shape `getProjectsAdminPaged` etc. already return |
| Filtering | `?field=value` query params mapped to a typed filters object, same pattern as `ProjectListFilters` in `lib/admin-queries.ts` |
| Sorting | `?sort=` query param mapped via a `buildXOrderBy()` switch function, same pattern as `buildProjectOrderBy` |
| Error Handling | consistent JSON error envelope: `{ "error": { "code": string, "message": string } }` — to be standardized before the first `v1` route ships |
| Rate Limiting | reuse `lib/rate-limit.ts`'s `checkRateLimit()` (already dependency-free, in-memory, documented as swappable for Redis at scale) |
| Versioning | path-based (`/api/v1/...`), never breaking a shipped version — add `/api/v2/...` instead |
| Typed Responses | every route handler's response shape should have a corresponding exported TypeScript type, consumed by any client (web or mobile) |

---

## 3. Database Migration Policy

**Status: already the practiced policy** — every migration in `prisma/migrations/` to date has been additive (new columns, new indexes, new tables). The most recent example (`20260728072442_admin_cms_trash`) added `deletedAt`/`deletedByUserId` to four existing tables without touching any existing column.

Binding rules from this point forward:

1. **Never remove existing tables without an approved migration.** "Approved" means explicitly requested and confirmed by a human, not inferred from a refactor.
2. **Never rename production columns if it would break compatibility.** If a column name is genuinely wrong, add the correctly-named column, backfill, migrate all read/write sites, and only then consider deprecating the old column in a separate, later, explicitly-approved change — never a rename in place.
3. **Prefer adding new columns over changing existing behavior.** Exactly how Trash was implemented: `deletedAt`/`deletedByUserId` are new columns; `isPublished`/`isArchived` (already filtered by ~54 existing public queries) were reused, not redefined.
4. **Keep stable IDs forever.** Every model uses `String @id @default(cuid())` — never auto-increment integers, never reused/recycled IDs.
5. **Historical references must never break.** `AuditLog.entityId`, `Transaction.projectId`, `SavedProject.projectId`, etc. must remain resolvable — this is why permanent deletion is a deliberate, ADMIN-gated, Trash-first action (see the CMS Trash system), not a routine operation.

Non-interactive migration workflow (specific to this project's Neon HTTP adapter, which doesn't support `prisma migrate dev`'s interactive mode):
```
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script > migration.sql
# review the generated SQL, then:
npx prisma migrate deploy
npx prisma generate
```

---

## 4. Event & Change Policy

**Status: not yet implemented as a real event system — this section is the standard for the future, stated honestly as a gap.**

Today, cross-cutting effects of a mutation (cache invalidation, audit logging) are handled by **direct function calls** at the end of each action (`logAudit(...)`, `revalidateProject(...)`), not by an event bus. This works correctly at the current scale but is direct coupling: every action file has to remember to call both functions itself.

**The named events below are not yet emitted as distinct, subscribable events.** `AuditLog.action` strings (`"project.create"`, `"project.publish"`, `"builder.permanent-delete"`, etc.) already exist and are a reasonable naming convention for future event names, but nothing subscribes to them today — they're a write-only log, read back only by the admin History panel and activity feed.

**Recommended event vocabulary** (to align future work, using the `AuditLog.action` strings already in use as the naming convention):
`ProjectCreated`, `ProjectUpdated`, `ProjectPublished`, `ProjectUnpublished`, `ProjectArchived`, `ProjectTrashed`, `ProjectRestored`, `ProjectPermanentlyDeleted`, `BuilderCreated`/`BuilderUpdated`/etc. (same suffix set), `TransactionImported`, `ReviewApproved`, `ReviewRejected`, `MediaUploaded`, `MediaDeleted`.

**Migration path when a real event system is built**: introduce a single `emitEvent(name, payload)` helper (likely backed by `AuditLog` writes plus, e.g., an in-process `EventEmitter` or a queue for anything needing async fan-out), call it from the same places `logAudit()` is already called, and let future modules subscribe instead of being called synchronously inline. This is additive — it does not require touching how `logAudit`/`revalidateX` work today, only adding a new call alongside them.

**Binding rule for any future module**: if a new module needs to react to another module's change (e.g. a future "AI re-scoring" module reacting to `ProjectUpdated`), it must **not** be added as a direct function call inside `lib/actions/projects.ts`. It must subscribe to the event once the event system above exists — this is the whole point of introducing it.

---

## 5. Testing Standards

**Status: aspirational — no automated test suite exists in this repository today.** `package.json` has no `jest`, `vitest`, `playwright`, or `@testing-library/*` dependency, and there is no `__tests__` or `*.test.ts` file anywhere in the codebase. This is stated plainly so this document is never mistaken for a claim of existing coverage.

Binding rule from this point forward: **every new feature's pull request must include**, at minimum, the categories below scoped to what that feature actually touches:

| Category | What it means here |
|---|---|
| Unit Tests | pure functions — `lib/analytics/*`, `lib/project-data.ts`'s field-mapping, `lib/ingestion/duplicateMatch.ts`, `lib/format.ts` |
| Integration Tests | a Server Action's full path against a real (test) database — e.g. "create → soft-delete → restore → permanent-delete" round-trips, exactly the shape of the disclosed-fixture verification scripts already used manually during the CMS production-readiness phase |
| Regression Tests | a failing case reproduced once, then locked in, for any bug fix |
| Permission Tests | every ADMIN-only action rejected for an EDITOR session, and vice versa where applicable |
| Validation Tests | zod schema boundary cases (empty required field, out-of-range number, malformed URL) |
| Performance Checks | for anything touching a list query with `orderBy`/`where` on a large table (Project, Transaction) — confirm an index exists for the new filter/sort path (see `@@index` conventions in the Data Dictionary) |

**Immediate next step recommendation** (not performed as part of this documentation phase, since introducing a test framework is itself a real architectural decision the user should confirm): adopt `vitest` for unit/integration tests, given it works cleanly with this project's ESM + TypeScript + Next.js 16 setup without extra transpilation config.

**Every future pull request must pass all existing tests before merging** — once the above exists, this becomes enforceable via CI; until then, `npm run build`, `npm run lint`, and `npx tsc --noEmit` are the enforced gate (see Final Acceptance Criteria in `docs/README.md`).

---

## 6. Code Quality Standards

**Status: already the practiced convention** across the codebase, verified by direct inspection while writing this document:

- **SOLID / Clean Architecture**: read layer (`lib/queries/*.ts`, `lib/admin-queries.ts`) is fully separated from the write layer (`lib/actions/*.ts`); UI components never call Prisma directly.
- **Repository Pattern (adapted)**: `lib/admin-queries.ts` and `lib/queries/*.ts` are the repository layer — every Prisma query for a given read concern lives in exactly one of these files, wrapped in `safeQuery()` for admin reads (degrades to an empty/zero fallback rather than crashing the page on a transient DB error).
- **Service Layer**: `lib/cache.ts`, `lib/audit.ts`, `lib/cloudinary.ts`, `lib/analytics/*`, `lib/infra-linking.ts` are the service layer — cross-cutting concerns, never duplicated inline in an action.
- **DRY**: shared logic is extracted the moment two callers need it (see Module Contracts §"reuse existing services").
- **Strict TypeScript**: `tsconfig.json` strict mode is on; `npx tsc --noEmit` is part of the enforced verification gate for every change in this project's history so far.
- **Reusable Components**: admin CRUD UI (`ProjectsTable`/`BuildersTable`/`LocalitiesTable`, `ProjectCardsGrid`/`BuilderCardsGrid`/`LocalityCardsGrid`, `ConfirmButton`, `TrashPanel`) follow one shared pattern across all four entities rather than four bespoke implementations.
- **Meaningful Naming / Consistent Folder Structure**: `lib/actions/<entity>.ts` for writes, `lib/queries/<concern>.ts` / `lib/admin-queries.ts` for reads, `app/admin/components/<Entity><Purpose>.tsx` for admin UI — a new module should follow this exact placement, not invent a new convention.
- **No duplicated logic**: enforced by the Module Contracts above.

**Binding rule for any future module**: match the existing folder/naming convention exactly (`lib/actions/<newEntity>.ts`, `lib/queries/<newEntity>.ts` if it needs public reads, `app/admin/components/<NewEntity>Table.tsx` + `<NewEntity>CardsGrid.tsx` if it needs an admin list UI) — do not introduce a parallel structure for convenience.
