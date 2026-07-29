# NoDalalTalks — Data Dictionary

**Status**: generated from `prisma/schema.prisma` (39 models, 10 enums) as of this writing. This is a living document — whoever adds or changes a model **must** update this file in the same change, per the Governance Standards (`docs/governance-standards.md`).

## Scope note on "Used By"

For every table, `Used By` is documented **at the table level** (which pages, admin surfaces, API/actions, charts, reports, and AI features actually query or write this table), not per individual field. A per-field "used by" matrix across ~39 tables and hundreds of fields would mostly be noise or guesswork; the table-level view is what a developer actually needs before touching a model. Where one specific field drives something distinctive (e.g. `Project.isFeatured` driving the homepage rail), that's called out in the field's own Description.

## How to read each entry

Each table has:
- **Purpose / Description** — why the table exists, in plain language.
- **Fields** — name, type, required/optional, validation, default, editable vs. system-generated, derived vs. stored.
- **Relationships** — foreign keys, cascade behavior.
- **Source of Data** — where rows come from (admin form, ingestion connector, computed).
- **Used By** — pages, actions/APIs, charts, reports, AI.
- **Future Expansion Notes** — what's already designed-in for growth, and what would need a real migration.

Conventions used in the Fields tables:
- **Editable**: `Admin form` (editable via a UI form), `System` (only ever set by application code, e.g. `createdAt`, `deletedByUserId`), `Import` (populated by an ingestion connector), or `N/A` (not applicable, e.g. relation fields).
- **Derived/Stored**: `Stored` (a fact written directly), `Derived-stored` (computed once and persisted, e.g. `pricePerSqftPaise`), or `Derived-live` (never stored, computed at read time — noted even though it isn't a column, wherever relevant).

---

## 1. Provenance system (not a table — a contract enforced by every table below)

### `enum DataSource`
**Purpose**: Tags the origin of every fact-bearing row so nothing renders without a nameable source.
**Values**: `OFFICIAL_GOVERNMENT`, `BUILDER_INFORMATION`, `MANUALLY_VERIFIED`, `AI_GENERATED`, `USER_SUBMITTED`, `EXTERNAL_OPEN_DATA`.
**Used By**: Every model below that has a `dataSource` column; rendered as a visible source badge on Project/Builder/Locality/Transaction detail pages and in the Admin Review Queue.

### `enum Confidence`
**Purpose**: How confident the platform is in a curated/resolved fact. Values: `HIGH`, `MEDIUM`, `LOW`.
**Used By**: Same tables as `DataSource`; not currently rendered publicly, used by admins to judge which rows need re-verification.

---

## 2. Geo hierarchy

### `Country`
**Purpose**: Top of the multi-tenant geo hierarchy — supports expansion beyond India without a schema change.
**Description**: One row today ("India"). Holds ISO code and currency (so money could generalize beyond paise/INR later).

| Field | Type | Required | Validation | Default | Editable | Derived/Stored |
|---|---|---|---|---|---|---|
| id | String (cuid) | Yes | N/A | auto | System | Stored |
| name | String | Yes | unique | — | Admin (seed script only, no UI) | Stored |
| iso2 | String | Yes | unique, 2-letter | — | Seed only | Stored |
| currency | String | Yes | — | — | Seed only | Stored |
| createdAt / updatedAt | DateTime | Yes | N/A | now() / auto | System | Stored |

**Relationships**: has many `State`.
**Source of Data**: seeded once at project bootstrap; no admin UI exists to manage countries (not needed at current scale).
**Used By**: Pages: none directly (traversed via State→City). APIs: none. Charts/Reports/AI: none.
**Future Expansion Notes**: Adding a second country is "add a row", not a migration — this is the reason the hierarchy exists at all.

### `State`
**Purpose**: State/province level (e.g. Maharashtra), carries the official RERA portal URL for future ingestion.

| Field | Type | Required | Validation | Default | Editable | Derived/Stored |
|---|---|---|---|---|---|---|
| id | String (cuid) | Yes | — | auto | System | Stored |
| countryId | String (FK) | Yes | must reference Country | — | Seed only | Stored |
| name | String | Yes | unique per country | — | Seed only | Stored |
| code | String | Yes | unique per country | — | Seed only | Stored |
| reraPortalUrl | String? | No | valid URL (not enforced by code today) | null | Seed only | Stored |
| createdAt / updatedAt | DateTime | Yes | — | now()/auto | System | Stored |

**Relationships**: belongs to `Country`; has many `City`.
**Source of Data**: seeded.
**Used By**: none directly today.
**Future Expansion Notes**: `reraPortalUrl` is the anchor point for a future MahaRERA-style connector per state.

### `City`
**Purpose**: The city-level tenant boundary — Mumbai is the only `isLive: true` row today; every other city row (if seeded) stays dark until flipped on.

| Field | Type | Required | Validation | Default | Editable | Derived/Stored |
|---|---|---|---|---|---|---|
| id | String (cuid) | Yes | — | auto | System | Stored |
| stateId | String (FK) | Yes | — | — | Seed only | Stored |
| name | String | Yes | unique per state | — | Seed only | Stored |
| slug | String | Yes | globally unique | — | Seed only | Stored |
| isLive | Boolean | Yes | — | false | Seed/manual DB edit only (no admin UI) | Stored |
| centroidLat / centroidLng | Float? | No | — | null | Seed only | Stored |
| createdAt / updatedAt | DateTime | Yes | — | now()/auto | System | Stored |

**Relationships**: belongs to `State`; has many `Zone`, `Locality`, `Project`.
**Source of Data**: seeded; `PRIMARY_CITY_SLUG` (`lib/queries/shared.ts`) hardcodes which city slug the entire public site scopes to ("mumbai").
**Used By**: Pages: every public listing page filters `city.slug = PRIMARY_CITY_SLUG`. APIs: `getMarketSnapshot`, most of `lib/admin-queries.ts`. Charts/Reports: all city-scoped aggregates. AI: none.
**Future Expansion Notes**: launching a second city means seeding a new `City` row, flipping `isLive`, and changing `PRIMARY_CITY_SLUG` to a resolver instead of a constant — the only real code change needed, everything else already keys off `cityId`.

### `Zone`
**Purpose**: Sub-city grouping (e.g. "Western Suburbs", "South Mumbai") for filtering and navigation.

| Field | Type | Required | Validation | Default | Editable | Derived/Stored |
|---|---|---|---|---|---|---|
| id | String (cuid) | Yes | — | auto | System | Stored |
| cityId | String (FK) | Yes | — | — | Seed/admin script | Stored |
| name | String | Yes | — | — | Seed/admin script | Stored |
| slug | String | Yes | unique per city | — | Seed/admin script | Stored |
| createdAt / updatedAt | DateTime | Yes | — | now()/auto | System | Stored |

**Relationships**: belongs to `City`; has many `Locality`.
**Source of Data**: manually curated (no dedicated admin CRUD UI today — Zones are assigned to Localities via the Locality form's zone dropdown, populated by `getZones()`).
**Used By**: Pages: Locality filter bar, Locality admin form zone select. APIs: `getZones()`. Charts/Reports: locality-by-zone groupings where used. AI: none.
**Future Expansion Notes**: a dedicated Zone CRUD admin page is a natural, low-risk addition (reuses the same list/edit pattern as Locality) if zone curation outgrows manual DB edits.

### `Locality`
**Purpose**: The core neighborhood entity (Bandra West, Lower Parel…) — carries editorial content, curated market snapshot, insight scores, and SEO metadata. One of the four entities with full CMS lifecycle (Create/Edit/Publish/Archive/Trash).

| Field | Type | Required | Validation | Default | Editable | Derived/Stored |
|---|---|---|---|---|---|---|
| id | String (cuid) | Yes | — | auto | System | Stored |
| cityId | String (FK) | Yes | — | — | Admin form (implicit, always primary city) | Stored |
| zoneId | String? (FK) | No | must reference Zone in same city (not enforced at app layer) | null | Admin form | Stored |
| name | String | Yes | non-empty (zod `min(1)`) | — | Admin form | Stored |
| slug | String | Yes | auto-derived from name if blank, unique per city (`uniqueLocalitySlug`) | derived | Admin form (optional override) | Derived-stored |
| pincode | String? | No | — | null | Admin form | Stored |
| description | String? | No | rich-text HTML | null | Admin form | Stored |
| centroidLat / centroidLng | Float? | No | -90..90 / -180..180 (zod) | null | Admin form | Stored |
| avgPricePerSqftPaise | BigInt? | No | ≥0 (rupees input × 100) | null | Admin form | Stored |
| rentalYieldPercent | Decimal(5,2)? | No | 0..100 | null | Admin form | Stored |
| growthPercentYoy | Decimal(5,2)? | No | -100..1000 | null | Admin form | Stored |
| marketDataSource | DataSource? | No | set automatically to `MANUALLY_VERIFIED` whenever any market field is present | null | System (derived from form input) | Derived-stored |
| marketAsOf | DateTime? | No | set to `now()` whenever any market field is present | null | System | Derived-stored |
| connectivityNotes | String? | No | freeform | null | Admin form | Stored |
| coverImageUrl | String? | No | valid URL | null | Admin form (via uploader) | Stored |
| isPublished / isFeatured / isArchived | Boolean | Yes | — | false | Admin (ADMIN role for publish/archive; see Governance) | Stored |
| deletedAt / deletedByUserId | DateTime? / String? | No | set together on Trash | null | System (Trash action) | Stored |
| metaTitle | String? | No | ≤70 chars | null | Admin form | Stored |
| metaDescription | String? | No | ≤160 chars | null | Admin form | Stored |
| canonicalUrl / ogImageUrl | String? | No | valid URL | null | Admin form | Stored |
| investmentScore / endUserScore / luxuryScore / familyScore | Decimal(3,1)? | No | 0..10 | null | Admin form | Stored (curated, not computed) |
| advantages / disadvantages | String[] | Yes | one line per bullet | [] | Admin form (textarea, newline-split) | Stored |
| createdAt / updatedAt | DateTime | Yes | — | now()/auto | System | Stored |

**Relationships**: belongs to `City`, optionally `Zone`; has many `LocalityAlias`, `MicroMarket`, `Project`, `Transaction`, `LocalityAmenity`, `LocalityImage`.
**Source of Data**: 100% admin-curated today (`MANUALLY_VERIFIED`); no ingestion connector writes to `Locality` directly.
**Used By**: Pages: `/localities`, `/localities/[slug]`, `/map`, `/reports/areas/[slug]`, every admin Locality page. APIs/Actions: `lib/actions/localities.ts`, `lib/queries/index.ts`, `lib/admin-queries.ts`. Charts: locality price/rental-yield/growth bars on `/reports`. Reports: Area Report. AI: none directly (locality scores feed `LocalityAnalyticsService`, a deterministic formula, not an LLM).
**Future Expansion Notes**: `marketDataSource`/`marketAsOf` are already IGR-swap-ready — a future automated price feed just needs to set `dataSource: OFFICIAL_GOVERNMENT` and write the same three columns.

### `LocalityAmenity` / `LocalityImage` / `LocalityAlias`
**Purpose**: Junction/child tables for Locality — amenity tags, photo gallery, and alternate spellings (for future automated matching).

| Table | Key fields | Editable | Derived/Stored |
|---|---|---|---|
| LocalityAmenity | `localityId`, `amenityId` (unique pair) | Admin form (amenity checklist) | Stored |
| LocalityImage | `url`, `alt`, `sortOrder` | Admin (`LocalityGalleryUploader`, Cloudinary) | Stored |
| LocalityAlias | `alias`, `source` | No admin UI yet — populated manually/by future ingestion | Stored |

**Relationships**: all `onDelete: Cascade` from `Locality` — deleting (permanently) a Locality removes these automatically.
**Used By**: LocalityAmenity → amenity filter/display on Locality pages. LocalityImage → Locality gallery uploader + public gallery. LocalityAlias → not yet consumed by any query; reserved for future fuzzy-matching in ingestion (`lib/ingestion/duplicateMatch.ts` doesn't use it yet).
**Future Expansion Notes**: `LocalityAlias.source` is intended to record where a spelling variant came from ("IGR", "colloquial") once an automated matcher starts consuming it.

### `MicroMarket`
**Purpose**: Finer-than-locality grain (e.g. "Pali Hill" within "Bandra West") — an SEO/analytics surface for future granularity.

| Field | Type | Required | Editable | Derived/Stored |
|---|---|---|---|---|
| localityId | String (FK) | Yes | Admin form (Project form's micro-market select) | Stored |
| name / slug | String | Yes | Admin (`MicroMarketManager` on the Locality edit page) | Stored |

**Relationships**: belongs to `Locality`; optionally referenced by `Project.microMarketId`.
**Used By**: Pages: Project admin form (optional micro-market assignment); no dedicated public micro-market page yet. APIs: `getMicroMarketsForLocality`.
**Future Expansion Notes**: a public micro-market landing page is a straightforward future page, no schema change needed.

---

## 3. Catalog — Builders & Projects

### `Builder`
**Purpose**: A developer/company entity — profile, trust signals, portfolio. Full CMS lifecycle (Create/Edit/Publish/Archive/Trash), same pattern as Locality/Project.

| Field | Type | Required | Validation | Default | Editable | Derived/Stored |
|---|---|---|---|---|---|---|
| id | String (cuid) | Yes | — | auto | System | Stored |
| slug | String | Yes | unique, auto-derived if blank | — | Admin form | Derived-stored |
| name | String | Yes | non-empty | — | Admin form | Stored |
| legalNames | String[] | Yes | one per line | [] | Admin form | Stored |
| logoUrl / coverImageUrl | String? | No | valid URL | null | Admin (uploader, Cloudinary) | Stored |
| description | String? | No | rich-text HTML | null | Admin form | Stored |
| foundedYear | Int? | No | 1800..2100 | null | Admin form | Stored |
| headquarters | String? | No | — | null | Admin form | Stored |
| websiteUrl | String? | No | valid URL | null | Admin form | Stored |
| reraNumber | String? | No | — | null | Admin form | Stored |
| awards | String[] | Yes | one per line | [] | Admin form | Stored |
| dataSource | DataSource | Yes | enum | MANUALLY_VERIFIED | Admin form | Stored |
| confidence | Confidence | Yes | enum | HIGH | Admin form | Stored |
| isPublished / isFeatured / isArchived | Boolean | Yes | — | false | Admin (ADMIN role for publish/archive) | Stored |
| deletedAt / deletedByUserId | DateTime? / String? | No | set together on Trash | null | System (Trash action) | Stored |
| metaTitle / metaDescription / ogImageUrl | String? | No | ≤70 / ≤160 / URL | null | Admin form | Stored |
| createdAt / updatedAt | DateTime | Yes | — | now()/auto | System | Stored |

**Relationships**: has many `Project`, `BuilderScoreSnapshot`, `BuilderTimelineEvent`, `BuilderAmenity`, `BuilderImage`.
**Source of Data**: admin-curated (`MANUALLY_VERIFIED`); CSV/JSON import currently supports Projects only, not Builders directly (a Project import can reference an existing `builderId`, but doesn't create Builders).
**Used By**: Pages: `/builders`, `/builders/[slug]`, `/reports/developers/[slug]`, admin Builder CRUD + Trash. Actions: `lib/actions/builders.ts`. Charts: builder trust-score leaderboard, portfolio breakdown (`getBuilderScorecards`). Reports: Developer Report. AI: none directly today (score is a deterministic formula over `BuilderScoreSnapshot`, not an LLM call).
**Future Expansion Notes**: a Builder-specific CSV import is the natural next ingestion connector, reusing the exact staging/review pattern already built for Projects.

### `BuilderAmenity` / `BuilderImage` / `BuilderTimelineEvent` / `BuilderScoreSnapshot`
**Purpose**: Builder child tables — amenity tags, gallery, company history timeline, and versioned trust scores.

| Table | Purpose | Editable | Derived/Stored |
|---|---|---|---|
| BuilderAmenity | amenity tag junction | Admin form checklist | Stored |
| BuilderImage | company gallery | Admin (`BuilderGalleryUploader`) | Stored |
| BuilderTimelineEvent | milestone (`year`, `title`, `description`) | Admin (`BuilderTimelineManager`) | Stored |
| BuilderScoreSnapshot | versioned score (`overallScore`, `onTimeDeliveryPct`, `deliveredProjects`, `activeProjects`, `litigationFlags`, `methodologyVersion`) | Admin (`BuilderScoreManager`) — never overwritten, each save is a new row keyed by `(builderId, asOf)` | Stored (curated input; `dataSource` defaults to `AI_GENERATED` since it's a computed-style metric even when hand-entered) |

**Relationships**: all `onDelete: Cascade` from `Builder`.
**Used By**: BuilderScoreSnapshot → trust-score leaderboard, Builder profile "Trust Score" panel, `getBuilderTrustLeaderboard`. BuilderTimelineEvent → Builder profile timeline. BuilderImage → Builder profile gallery.
**Future Expansion Notes**: `methodologyVersion` exists so a future change to the scoring formula doesn't retroactively reinterpret old snapshots — old rows keep the methodology they were computed under.

### `Project`
**Purpose**: The central catalog entity — a residential/commercial project for sale. The most-used, most-linked table in the schema; full CMS lifecycle plus Review Queue (bulk import).

| Field | Type | Required | Validation | Default | Editable | Derived/Stored |
|---|---|---|---|---|---|---|
| id | String (cuid) | Yes | — | auto | System | Stored |
| slug | String | Yes | unique, auto-derived | — | Admin form | Derived-stored |
| name | String | Yes | non-empty | — | Admin form / Import | Stored |
| tagline / description | String? | No | freeform / rich-text | null | Admin form | Stored |
| builderId | String? (FK) | No | must reference Builder | null | Admin form / Import | Stored |
| developerGroup | String? | No | freeform SPV/holding name when it differs from resolved Builder | null | Admin form / Import | Stored |
| cityId | String (FK) | Yes | always primary city today | — | System (resolved, not user-picked) | Stored |
| localityId | String (FK) | Yes | required, must reference Locality | — | Admin form / Import | Stored |
| microMarketId | String? (FK) | No | must reference MicroMarket in same locality (not enforced at app layer) | null | Admin form | Stored |
| status | ProjectStatus (enum) | Yes | one of 7 values | — | Admin form / Import | Stored |
| category | PropertyCategory (enum) | Yes | one of 4 values | RESIDENTIAL | Admin form / Import | Stored |
| address | String? | No | — | null | Admin form | Stored |
| latitude / longitude | Float? | No | — | null | Admin form | Stored |
| launchDate / promisedPossession / actualPossession | DateTime? | No | valid date | null | Admin form | Stored |
| constructionPercent | Int? | No | 0..100 | null | Admin form | Stored |
| reraNumber | String? | Yes-unique when present | globally unique | null | Admin form / Import | Stored |
| reraStatus | String? | No | freeform | null | Admin form | Stored |
| totalUnits / totalTowers | Int? | No | ≥0 | null | Admin form | Stored |
| landAreaAcres | Decimal(8,2)? | No | ≥0 | null | Admin form | Stored |
| priceMinPaise / priceMaxPaise | BigInt? | No | ≥0 (rupees × 100) | null | Admin form / Import | Stored |
| dataSource | DataSource | Yes | enum | MANUALLY_VERIFIED | Admin form / Import | Stored |
| confidence | Confidence | Yes | enum | HIGH | Admin form / Import | Stored |
| sourceRef | String? | No | freeform lineage tag | null | Admin form / Import | Stored |
| ingestBatchId | String? | No | set when created via ingestion | null | System (import) | Stored |
| isPublished / isFeatured / isArchived | Boolean | Yes | — | false | Admin (ADMIN role for publish/archive; EDITOR for create/edit) | Stored |
| deletedAt / deletedByUserId | DateTime? / String? | No | set together on Trash | null | System (Trash action, ADMIN-only) | Stored |
| isTrending / isLuxury / isAffordable | Boolean | Yes | independent editorial tags, not derived from `status` | false | Admin form | Stored |
| brochureUrl | String? | No | Cloudinary raw-asset URL | null | Admin (`BrochureUploader`) | Stored |
| highlights | String[] | Yes | one per line | [] | Admin form | Stored |
| videoUrl / tour360Url | String? | No | — | null | Admin form | Stored |
| metaTitle / metaDescription / ogImageUrl | String? | No | ≤70 / ≤160 / URL | null | Admin form | Stored |
| createdAt / updatedAt | DateTime | Yes | — | now()/auto | System | Stored |

**Relationships**: belongs to `Builder?`, `City`, `Locality`, `MicroMarket?`; has many `ProjectImage`, `Configuration`, `ProjectAmenity`, `Transaction`, `PriceHistoryPoint`, `ProjectInfra`, `ProjectMetric`, `InvestmentNote`, `ProjectSpecification`, `ProjectDocument`, `ProjectTimelineEvent`, `ProjectFaq`, `ProjectSection`, `SavedProject`.
**Source of Data**: admin form (`MANUALLY_VERIFIED`) or CSV/JSON bulk import (any `DataSource`, always lands in `IngestStagingRecord` first — never writes directly).
**Used By**: Pages: `/projects`, `/projects/[slug]`, `/`, `/map`, `/reports/projects/[slug]`, every admin Project page, Review Queue. Actions: `lib/actions/projects.ts`, `lib/actions/ingestion.ts`. Charts: price distribution, status breakdown, locality/builder breakdown (`getDashboardCharts`). Reports: Project Report, Market Report. AI: `InvestmentNote` (AI-generated summary/pros/cons) references this table; `ProjectMetric` (demand/health scores) is deterministic analytics today, tagged `AI_GENERATED` as a placeholder for when it becomes model-driven.
**Future Expansion Notes**: `sourceRef` + `ingestBatchId` are the exact fields a live RERA/IGR connector would populate — no schema change needed to go from manual to automated for this table's core facts.

### `ProjectSpecification` / `ProjectDocument` / `ProjectTimelineEvent` / `ProjectFaq` / `ProjectSection` / `ProjectImage` / `Configuration` / `ProjectAmenity`
**Purpose**: Project child tables covering spec sheets, downloadable documents, construction timeline, FAQs, open-ended editorial sections, photo gallery, unit configurations, and amenity tags.

| Table | Key fields | Editable | Derived/Stored |
|---|---|---|---|
| ProjectSpecification | `category` (freeform), `detail`, `sortOrder` | Admin (`SpecificationsManager`) | Stored |
| ProjectDocument | `title`, `url`, `kind` (freeform, default `"document"`) | Admin (`DocumentsManager`, Cloudinary) | Stored |
| ProjectTimelineEvent | `title`, `description`, `eventDate` | Admin (`ProjectTimelineManager`) | Stored |
| ProjectFaq | `question`, `answer` | Admin (`ProjectFaqsManager`) | Stored |
| ProjectSection | `title`, `bodyHtml` (rich-text) | Admin (`ProjectSectionsManager`) | Stored |
| ProjectImage | `url`, `alt`, `kind` (hero/gallery/floorplan/elevation), `dataSource` | Admin (`ImageUploader`, Cloudinary) | Stored |
| Configuration | `label`, `bedrooms` (Decimal, supports "2.5"-style half-BHK), `carpetSqft`, `builtUpSqft`, `priceMinPaise/priceMaxPaise` | Admin (`ConfigurationsManager`) | Stored |
| ProjectAmenity | `amenityId` junction | Admin form checklist | Stored |

**Relationships**: all `onDelete: Cascade` from `Project`.
**Used By**: each renders on `/projects/[slug]` in its corresponding section; `Configuration` additionally drives the bedroom-count filter on `/projects` and the "2BHK/3BHK" chips; `ProjectImage` drives the homepage/listing thumbnails via `images: { take: 1 }`.
**Future Expansion Notes**: `ProjectSection` is deliberately open-ended (title + rich HTML body) specifically so new narrative content types never require a new column or table.

---

## 4. Shared taxonomy

### `Amenity`
**Purpose**: A single master amenity vocabulary shared by Project, Builder, and Locality — enables consistent filtering instead of per-entity free text.

| Field | Type | Required | Editable | Derived/Stored |
|---|---|---|---|---|
| slug / name | String | Yes | Admin (`/admin/... ` amenity management, referenced across all three amenity forms) | Stored |
| icon | String? | No | client-resolved icon key, no binary stored | Stored |
| category | AmenityCategory (enum: RECREATION/SAFETY/CONVENIENCE/WELLNESS/UTILITIES/OUTDOOR) | Yes, default CONVENIENCE | Admin | Stored |

**Relationships**: referenced by `ProjectAmenity`, `BuilderAmenity`, `LocalityAmenity`.
**Used By**: Pages: every amenity checklist in Project/Builder/Locality admin forms; amenity chips on public detail pages; amenity filter on `/projects`.
**Future Expansion Notes**: adding a new amenity is a new row, never a schema change; the category enum would need a migration if a genuinely new category grouping were required (low risk, additive).

---

## 5. Market data (the IGR swap-ready core)

### `Transaction`
**Purpose**: A single registered/recorded sale, resale, or lease. **The signature "swap-ready" model**: manually-curated rows today and future IGR-ingested rows are the exact same shape, differing only in `dataSource`/`sourceRef`/`ingestBatchId`/`confidence`.

| Field | Type | Required | Validation | Default | Editable | Derived/Stored |
|---|---|---|---|---|---|---|
| id | String (cuid) | Yes | — | auto | System | Stored |
| projectId | String? (FK) | No | must reference Project | null | Admin form | Stored |
| localityId | String (FK) | Yes | required | — | Admin form | Stored |
| type | TransactionType (enum: SALE/RESALE/LEASE) | Yes | — | SALE | Admin form | Stored |
| registrationDate | DateTime | Yes | required | — | Admin form | Stored |
| valuePaise | BigInt | Yes | > 0 (rupees × 100) | — | Admin form | Stored |
| carpetSqft / builtUpSqft | Decimal(10,2)? | No | > 0 | null | Admin form | Stored |
| pricePerSqftPaise | BigInt? | No | explicit input, or derived from `valuePaise / carpetSqft` if omitted | null | Admin form (optional) | Derived-stored when omitted |
| bedrooms | Decimal(3,1)? | No | ≥0 | null | Admin form | Stored |
| floor | Int? | No | integer | null | Admin form | Stored |
| tower / unitLabel | String? | No | freeform | null | Admin form | Stored |
| buyerType | BuyerType? (enum: INDIVIDUAL/COMPANY) | No | — | null | Admin form | Stored |
| dataSource | DataSource | Yes | enum | MANUALLY_VERIFIED | Admin form | Stored |
| confidence | Confidence | Yes | enum | MEDIUM | Admin form | Stored |
| sourceRef | String? | No | manual note today; registry doc number once IGR lands | null | Admin form | Stored |
| ingestBatchId | String? | No | set by ingestion | null | System (import) | Stored |
| sourceNote | String? | No | freeform | null | Admin form | Stored |
| deletedAt / deletedByUserId | DateTime? / String? | No | set together on Trash | null | System (Trash action, ADMIN-only) | Stored |
| createdAt / updatedAt | DateTime | Yes | — | now()/auto | System | Stored |

**Relationships**: belongs to `Project?`, `Locality`. Unique constraint `(dataSource, sourceRef)` makes future ingestion idempotent without touching manual rows.
**Source of Data**: 100% admin-curated today.
**Used By**: Pages: `/transactions`, `/transactions/[id]`, `/reports/transactions`, `/market-data`, `/map`, admin Transaction CRUD + Trash. Actions: `lib/actions/transactions.ts`. Charts: `TransactionCharts`, `PriceTrendChart`, monthly trend, configuration distribution, property-type distribution (`lib/analytics/transactionAnalytics.ts`). Reports: Transaction Report, Market Report. AI: feeds `ProjectMetric`/`LocalityAnalyticsService` demand indicators (deterministic, not LLM-based).
**Future Expansion Notes**: this is the table the whole schema's design note is about — a live IGR connector writes here with zero schema change, exactly as documented in the schema file's header comment.

### `PriceHistoryPoint`
**Purpose**: Monthly price-per-sqft series per project (curated or observed) — same swap-ready design as Transaction.

| Field | Type | Required | Editable | Derived/Stored |
|---|---|---|---|---|
| projectId | String (FK) | Yes | Admin | Stored |
| month | DateTime | Yes (first-of-month) | Admin | Stored |
| avgPricePerSqftPaise | BigInt | Yes | Admin | Stored |
| sampleSize | Int | default 0 (0 = curated estimate, not a real sample) | Admin/System | Stored |
| dataSource / confidence | enum | default MANUALLY_VERIFIED / MEDIUM | Admin | Stored |

**Relationships**: belongs to `Project`, unique per `(projectId, month)`.
**Used By**: `PriceTrendChart` on Project detail pages and `/admin/price-trends`.
**Future Expansion Notes**: `sampleSize > 0` is the flag a future automated aggregator would set to distinguish a real observed average from a hand-entered estimate.

### `ProjectMetric`
**Purpose**: Named, versioned, pre-computed project-level metrics (demand score, health score, market-trend %, avg ppsf) — new metrics are new rows, never new columns.

| Field | Type | Required | Editable | Derived/Stored |
|---|---|---|---|---|
| projectId | String (FK) | Yes | System (computed) | Stored |
| key | String | Yes, unique per project | System | Derived-stored |
| valueNumeric / valueText | Decimal? / String? | No | System | Derived-stored |
| unit | String? | No, freeform ("score_0_100"/"bps"/"paise"/"percent") | System | Stored |
| methodologyVersion | String? | No | System | Stored |
| asOf | DateTime | default now() | System | Stored |

**Relationships**: belongs to `Project`.
**Used By**: Project Intelligence panels; `lib/analytics/projectAnalytics.ts` writes/reads this shape conceptually (current analytics are computed live from Transaction/Project data at read time via `AnalyticsService`, not all persisted here yet — see Architecture Overview for the live-vs-stored analytics split).
**Future Expansion Notes**: this table exists specifically so a genuinely AI/ML-computed score can be dropped in later (`dataSource: AI_GENERATED`, `methodologyVersion` bumped) without touching Project's own columns.

### `InvestmentNote`
**Purpose**: AI Investment Summary + pros/cons for a project, stored so it's cached, inspectable, and auditable — not regenerated on every page view.

| Field | Type | Required | Editable | Derived/Stored |
|---|---|---|---|---|
| projectId | String (FK) | Yes | Admin (`InvestmentNotesManager`) | Stored |
| kind | String | Yes ("summary"/"pro"/"con") | Admin | Stored |
| body | String | Yes | Admin | Stored |
| dataSource / confidence | enum | default AI_GENERATED / MEDIUM | Admin (can override tag) | Stored |

**Relationships**: belongs to `Project`.
**Used By**: Project detail page "Investment Notes" section.
**Future Expansion Notes**: today these are hand-written through the admin form tagged `AI_GENERATED` as a placeholder convention; wiring an actual LLM call to populate this table is additive (new service, same table).

---

## 6. Infrastructure

### `InfraAsset`
**Purpose**: A single piece of city infrastructure (metro station, school, hospital, mall, etc.) — the only table currently populated by a live, automated connector (OpenStreetMap Overpass).

| Field | Type | Required | Editable | Derived/Stored |
|---|---|---|---|---|
| cityId | String | Yes | Import/Admin | Stored |
| type | InfraType (enum, 10 values) | Yes | Import/Admin | Stored |
| name | String | Yes | Import/Admin | Stored |
| latitude / longitude | Float? | No | Import/Admin | Stored |
| detail | String? | No, freeform | Import/Admin | Stored |
| status | String | default "operational" | Import/Admin | Stored |
| dataSource | DataSource | default OFFICIAL_GOVERNMENT | Import/Admin | Stored |
| sourceRef | String? | unique when present — ingestion idempotency key (e.g. `"osm:node/123456"`) | System (import) / null for manual | Stored |
| ingestBatchId | String? | No | System (import) | Stored |

**Relationships**: has many `ProjectInfra`.
**Source of Data**: OpenStreetMap Overpass connector (`lib/ingestion/connectors/osmLocalityInfra.ts`) — 1,603 real records ingested as of the ingestion phase; can also be manually catalogued (`CatalogueInfraAssetForm`).
**Used By**: Pages: `/map` (infra layer), Locality/Project nearby-places sections. Actions: `lib/actions/infra-assets.ts`, `lib/infra-linking.ts`. AI: none.
**Future Expansion Notes**: `sourceRef` uniqueness is what makes repeat OSM syncs idempotent — re-running the connector updates existing rows instead of duplicating.

### `ProjectInfra`
**Purpose**: Precomputed proximity link between a Project and an InfraAsset (distance + walk time), so nearby-places lookups don't recompute geodistance on every page view.

| Field | Type | Required | Editable | Derived/Stored |
|---|---|---|---|---|
| projectId / infraId | String (FK) | Yes | System (`syncProjectNearbyInfra`) | Stored |
| distanceMeters | Int | Yes | System (haversine calc) | Derived-stored |
| walkMinutes | Int? | No | System (estimated) | Derived-stored |
| dataSource | DataSource | default MANUALLY_VERIFIED | System | Stored |

**Relationships**: belongs to `Project`, `InfraAsset`; unique per `(projectId, infraId)`.
**Used By**: `lib/infra-linking.ts` (`getNearbyInfraForTransaction`, Project/Locality nearby-places sections).
**Future Expansion Notes**: recomputed whenever a Project's create/update action runs (`syncProjectNearbyInfra`) — no manual "refresh nearby infra" step needed.

---

## 7. Identity — Founder Admin

### `User`
**Purpose**: An admin/editor/viewer account for the Founder Admin CMS — completely separate from public-site accounts (`PublicUser`).

| Field | Type | Required | Validation | Default | Editable | Derived/Stored |
|---|---|---|---|---|---|---|
| email | String | Yes | unique, valid email | — | Admin (Users page, ADMIN-only) | Stored |
| name | String? | No | — | null | Admin | Stored |
| passwordHash | String | Yes | bcrypt hash, never the plaintext | — | System (set on create/reset, never displayed) | Stored |
| role | UserRole (enum: ADMIN/EDITOR/VIEWER) | Yes | — | EDITOR | Admin (ADMIN-only) | Stored |
| isActive | Boolean | Yes | — | true | Admin (ADMIN-only) | Stored |
| lastLoginAt | DateTime? | No | — | null | System | Stored |

**Relationships**: has many `AuditLog`.
**Used By**: `/admin/users`, `lib/actions/users.ts`, `lib/auth/*` (session/guard/token), every `logAudit()` call (`actorId`).
**Future Expansion Notes**: `VIEWER` role exists in the enum but has no distinct UI treatment yet beyond "cannot mutate" (falls through the same `requireMutateSession`/`requireAdminSession` gates as a non-privileged role) — a read-only dashboard view is the natural extension point.

### `AuditLog`
**Purpose**: Records every admin mutation — who did what, when, and (as of the CMS production-readiness phase) the before/after field diff.

| Field | Type | Required | Editable | Derived/Stored |
|---|---|---|---|---|
| actorId | String? (FK to User) | No (null = system-triggered) | System | Stored |
| action | String | Yes, freeform dot-notation (`"project.create"`, `"builder.permanent-delete"`, …) | System | Stored |
| entityType / entityId | String | Yes | System | Stored |
| before / after | Json? | No | System (populated by `logAudit()`'s optional `changes` param since the CMS phase) | Stored |
| at | DateTime | default now() | System | Stored |

**Relationships**: belongs to `User?`.
**Used By**: `getActivityFeed()` (admin dashboard activity widget), the `History` panel on Project/Builder/Locality/Transaction edit pages (`getAuditHistory`).
**Future Expansion Notes**: this is the substrate a future real event bus (see Governance Standards' Event & Change Policy) would emit alongside, or from.

---

## 8. Public authentication (separate from Founder Admin)

### `PublicUser`
**Purpose**: A public-site visitor account (credentials or Google OAuth) — never touches `/admin`.

| Field | Type | Required | Validation | Default | Editable | Derived/Stored |
|---|---|---|---|---|---|---|
| email | String | Yes | unique, valid email | — | User (signup form) | Stored |
| phone | String? | No | unique when present | null | Reserved for future mobile-OTP, not collected in current signup form | Stored |
| passwordHash | String? | No (null for OAuth-only) | bcrypt hash | null | System | Stored |
| provider | AuthProvider (enum: CREDENTIALS/GOOGLE) | Yes | — | CREDENTIALS | System | Stored |
| googleId | String? | No | unique when present, Google's `sub` claim | null | System | Stored |
| image | String? | No | Google profile photo URL only | null | System | Stored |
| emailVerifiedAt | DateTime? | No | — | null | System (not currently wired to a verification flow) | Stored |
| lastLoginAt | DateTime? | No | — | null | System | Stored |

**Relationships**: has many `SavedProject`, `PublicPasswordResetToken`.
**Used By**: `/login`, `/signup`, `/account`, `/forgot-password`, `/reset-password`, `lib/actions/public-auth.ts`, `lib/public-auth/*`.
**Future Expansion Notes**: `phone` + nullable `passwordHash` already exist specifically so `MOBILE_OTP` can be added as a new `AuthProvider` enum value plus a new `lib/public-auth/otp.ts` — not a schema change. `emailVerifiedAt` is unused today (a gap, not a design decision) — no signup flow currently sets it.

### `SavedProject`
**Purpose**: A public user's bookmarked project — the "Saved Projects" list on `/account`.

**Relationships**: belongs to `PublicUser`, `Project`; unique per `(publicUserId, projectId)`, cascades on either parent's deletion.
**Used By**: `/account`, `lib/actions/saved-projects.ts`.

### `PublicPasswordResetToken`
**Purpose**: Short-lived, single-use forgot-password tokens. Only the **hash** of the token is stored — a leaked DB row can't be replayed as a live reset link.

| Field | Type | Required | Editable | Derived/Stored |
|---|---|---|---|---|
| tokenHash | String | Yes, unique | System | Stored |
| expiresAt | DateTime | Yes, 30-minute window | System | Stored |
| usedAt | DateTime? | No | System (set on redemption, prevents replay) | Stored |

**Relationships**: belongs to `PublicUser`, cascades on user deletion.
**Used By**: `/forgot-password`, `/reset-password`, `lib/actions/public-auth.ts` (Resend email delivery).

---

## 9. Ingestion pipeline

### `IngestSource`
**Purpose**: The registry of connectors backing the Admin Data Sync dashboard's buttons — enable/disable + last-run tracking.

| Field | Type | Required | Editable | Derived/Stored |
|---|---|---|---|---|
| key | String | Yes, unique (`"osm-locality-infra"`, `"csv-upload-projects"`, …) | System (seeded per connector) | Stored |
| kind | String | Yes ("API"/"DATASET_UPLOAD"/"MANUAL") | System | Stored |
| enabled | Boolean | default true | Admin (ADMIN-only toggle) | Stored |
| scheduleCron | String? | No — informational only; the real schedule lives in `vercel.json` | null | System | Stored |
| config | Json? | No | System | Stored |
| lastRunAt | DateTime? | No | System | Stored |

**Used By**: `/admin/data-sync`, `lib/actions/ingestion.ts` (`triggerSyncAction`, `toggleIngestSourceEnabledAction`), `/api/cron/ingest`.

### `IngestBatch`, `IngestLogEntry`, `IngestStagingRecord`
**Purpose**: One row per import run, one row per per-record outcome, and one row per record awaiting human review — the mechanism that guarantees "imports never silently overwrite curated data."

| Table | Key fields | Editable | Derived/Stored |
|---|---|---|---|
| IngestBatch | `sourceKey`, `trigger` (manual/scheduled), `status`, `recordsWritten/Skipped/Failed` | System | Stored |
| IngestLogEntry | `entityType`, `entityId?`, `action` (CREATED/UPDATED/SKIPPED_DUPLICATE/STAGED/FAILED), `message` | System | Stored |
| IngestStagingRecord | `entityType`, `targetId?` (null = new row, set = proposed merge), `payload` (Json), `matchedExistingId`, `matchConfidence`, `status` (PENDING/APPROVED/REJECTED) | System (created by connector); `status`/`reviewedByUserId`/`reviewedAt` set by admin approve/reject action | Stored |

**Relationships**: `IngestLogEntry`/`IngestStagingRecord` belong to `IngestBatch` (cascade).
**Used By**: `/admin/data-sync`, `/admin/data-sync/batches/[id]`, `/admin/data-sync/review` (Review Queue), `lib/actions/ingestion.ts`, `lib/ingestion/*`.
**Future Expansion Notes**: this is the generic staging substrate — a future MahaRERA/IGR connector reuses these three tables unchanged; only a new connector module under `lib/ingestion/connectors/` is needed.

---

## Field-naming and typing conventions (apply to all future tables)

- **Money**: always `BigInt` paise, never floats. Convert at the UI boundary only (`lib/format.ts`).
- **Areas**: `Decimal` sq ft, never `Float` (avoids binary rounding on repeated arithmetic).
- **IDs**: `String @id @default(cuid())` everywhere — never auto-increment integers (keeps IDs stable and non-guessable across environments).
- **Soft-delete**: `deletedAt DateTime?` + `deletedByUserId String?`, always paired, always indexed (`@@index([deletedAt])`).
- **Provenance**: any new fact-bearing table should carry `dataSource DataSource` and, where curated, `confidence Confidence`.
- **Ingestion lineage**: `sourceRef String?` (+ `@@unique` with `dataSource` where idempotency matters) and `ingestBatchId String?` on any table a future connector might write to.
