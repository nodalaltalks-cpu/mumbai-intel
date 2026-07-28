# Mumbai Intel — Documentation Index

This is the entry point for the platform's governance documentation, written during the Enterprise Governance phase. Start here.

| Document | What it covers |
|---|---|
| [`data-dictionary.md`](./data-dictionary.md) | Every database table and field — purpose, type, validation, relationships, source of data, and what consumes it. |
| [`feature-registry.md`](./feature-registry.md) | Every major feature (Projects, Builders, Transactions, Localities, Maps, Analytics, Search, Reviews, Media, Reports, Authentication, Admin CMS, Data Ingestion, and future features) with dependencies, tables, endpoints, pages, services, and permissions. |
| [`governance-standards.md`](./governance-standards.md) | Binding rules for all future work: Module Contracts, API Standards, Database Migration Policy, Event & Change Policy, Testing Standards, Code Quality Standards. |
| [`architecture-overview.md`](./architecture-overview.md) | System architecture, import pipeline, analytics engine, review workflow, media pipeline, search architecture, caching strategy, permission model. |
| [`deployment-recovery.md`](./deployment-recovery.md) | Deployment process, environment variables, routine recovery procedures, disaster recovery notes. |

**Maintenance rule**: any change that adds/removes a table, a feature, or a cross-cutting service must update the relevant document(s) in this same change — this is itself a binding rule under Governance Standards §6 (Code Quality Standards).

---

## Final Acceptance Criteria — verified status

Every item below was checked against the real codebase and, where practical, against a live run — not assumed. Anything not fully true is stated as such, not marked ✓.

| Criterion | Status | Evidence |
|---|---|---|
| Existing frontend is completely unchanged | ✓ | This phase touched zero public-facing pages/components — only `app/admin/*`, `lib/actions/*`, `lib/queries/*` (backend filters only), `prisma/schema.prisma`, and `docs/*`. |
| Existing user experience is preserved | ✓ | Same reasoning; no public UI/markup changed. |
| Existing URLs continue working | ✓ | `npm run build`'s route list shows every prior route still present; only `/admin/trash` was added, nothing removed or renamed. |
| Existing APIs remain compatible | ✓ | `logAudit()` extended with optional params (all 38+ existing call sites still compile); every `delete*Action` kept its original name/signature, only its internal behavior changed from hard-delete to soft-delete. |
| Existing data remains intact | ✓ | Verified live: every schema migration this phase was additive-only (new nullable columns); disclosed test-fixture scripts confirmed row counts return to baseline after every verification run. |
| Historical data is preserved | ✓ | Same evidence; `AuditLog`/`Transaction`/`Project` IDs are never reused or renumbered (cuid-based). |
| New modules can be added without redesign | **Substantially true, not provable by a single test** | Confirmed by pattern review: Trash/audit-history/role-gating for Project/Builder/Locality/Transaction all follow one identical, documented pattern (Governance Standards §1). This is a structural property, verified by consistent application, not something a single automated check can certify. |
| Charts and analytics are generated from data | ✓ | Every chart/report reads live via `AnalyticsService` over `lib/queries`/`lib/admin-queries`; confirmed no hardcoded/mock data in any chart component. |
| Admin Panel manages all business data | **Partially true — a real, disclosed gap** | Project/Builder/Locality/Transaction have full CMS (create/edit/publish/archive/trash/restore/permanent-delete/bulk). `Country`/`State`/`City`/`Zone` (geo hierarchy) and the master `Amenity` list have **no dedicated admin CRUD UI** — they're seed/manual-DB-edit only today. Not a blocker at current single-city scale; flagged in the Feature Registry (Zone) and Data Dictionary (Amenity) as a natural next admin surface. |
| Documentation is complete | ✓ | This index + the five documents it links, all written against the real schema/codebase in this phase. |
| Data Dictionary is complete | ✓ | All 39 models documented (verified count: `grep -c '^model ' prisma/schema.prisma` → 39). |
| Feature Registry is complete | ✓ | All of the user's example features documented, plus Data Ingestion (a major existing feature not in the example list) and three explicitly-marked **[FUTURE]** entries (AI, Consultation Marketplace, Mobile App). |
| Cloudinary cleanup works | ✓ (fixed during this phase) | Builder permanent-delete cleanup was the known gap going in — fixed and verified live (upload → delete → confirm gone via Cloudinary Admin API) for single delete, bulk delete, and Empty Trash. While verifying, two more real gaps were found and fixed the same way: (1) **Project's** permanent-delete deleted Cloudinary media *before* the DB row (unsafe order) and used the wrong resource-type API for its brochure (silently failed to actually delete it) — both fixed and reverified live. (2) **Locality's** permanent-delete didn't clean up its cover image or gallery at all — added and verified live. |
| Search updates automatically | ✓ | Both public and admin search query the live database on every request (`force-dynamic`, no search index to go stale). |
| SEO updates automatically | ✓ | `metaTitle`/`metaDescription`/`canonicalUrl`/`ogImageUrl` are stored fields rendered directly by server-rendered, `force-dynamic` pages — no build-time snapshot to fall out of date. |
| Analytics update automatically | ✓ | Same `force-dynamic` + live-query reasoning; no cached/precomputed dashboard data. |
| Database remains consistent after failures | ✓ (fixed during this phase) | All four entities' permanent-delete paths now follow DB-delete-first-then-Cloudinary-cleanup, verified live: a DB failure never touches media, and a Cloudinary failure is logged (never thrown) without leaving the database inconsistent. |
| Build passes | ✓ | `npm run build` clean (see verification log below). |
| TypeScript passes | ✓ | `npx tsc --noEmit` clean. |
| Lint passes | ✓ | `npm run lint` clean (one pre-existing, unrelated unused-var warning in `app/reports/transactions/page.tsx`; zero errors). |
| Production deployment succeeds | **Not independently verifiable from this environment** | This environment has no Vercel token or linked project — deployment happens via Vercel's GitHub auto-deploy on push to `main`. Confirm the Vercel dashboard shows the pushed commit's deployment as "Ready" before considering this criterion met. |

### What "not fully true" means here, concretely

Two items above are not blanket ✓:
1. **Admin Panel manages all business data** — geo hierarchy and the amenity master list are seed/manual-only. This was true before this phase and remains true after it; it's surfaced here so it's a visible, prioritizable backlog item rather than an assumption.
2. **New modules can be added without redesign** — asserted from consistent pattern application (verifiable by reading the code), not from an automated architecture-conformance test, since none exists (see Governance Standards §5, Testing Standards).

Everything else in the list above is either independently verified against real code/build output, or verified live against the production database and Cloudinary account using disclosed test fixtures that were fully cleaned up afterward (all `TEST FIXTURE —` prefixed rows/assets; DB row counts confirmed back to exact baseline in every run).
