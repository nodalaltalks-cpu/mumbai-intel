# NoDalalTalks — Deployment, Recovery & Disaster Recovery Guide

## Deployment

**Hosting**: Vercel, connected to the GitHub repository (`nodalaltalks-cpu/mumbai-intel`) via Vercel's native Git integration. **Every push to `main` triggers an automatic production deployment** — there is no manual `vercel --prod` step in the normal workflow, and no separate staging environment configured today.

**Build**: `next build` (Turbopack). `package.json`'s `postinstall` script runs `prisma generate` so the Prisma Client is always regenerated against the current `schema.prisma` on every install — this is required because the Neon HTTP adapter (`@prisma/adapter-neon`) is instantiated at runtime from the generated client.

**Cron**: `vercel.json` schedules `GET /api/cron/ingest` daily at 03:00, authenticated via a `CRON_SECRET` bearer token that Vercel auto-attaches when the env var is set on the project (see Environment Variables below) — this must be configured in the Vercel dashboard directly; there is no way to set it from this repository.

### Environment variables required

| Variable | Used by |
|---|---|
| `DATABASE_URL` | Neon Postgres connection string (`lib/prisma.ts`) |
| `SESSION_SECRET` | Admin session token signing (`lib/auth/token.ts`) |
| `PUBLIC_SESSION_SECRET` | Public-site session token signing (`lib/public-auth/token.ts`) |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | Media upload/delete (`lib/cloudinary.ts`) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Public-site Google OAuth (`lib/public-auth/google.ts`, `app/api/auth/google/*`) |
| `RESEND_API_KEY` / `EMAIL_FROM` | Password-reset emails (`lib/email.ts`) |
| `CRON_SECRET` | Authenticates Vercel Cron's call to `/api/cron/ingest` |
| `CONTACT_EMAIL` | Destination address for the `/contact` form |
| `NEXT_PUBLIC_APP_URL` | Absolute URL base (e.g. password-reset links in emails) |

All of the above must be set in the Vercel project's Environment Variables settings for production — this repository's `.env`/`.env.local` are local-only and never deployed.

### Database migrations at deploy time

**Important**: this project does **not** run `prisma migrate deploy` automatically as part of the Vercel build. Every migration to date has been applied manually against the production Neon database (`npx prisma migrate deploy`, using this repo's non-interactive workflow — see `docs/governance-standards.md` §3) **before or independent of** the corresponding code push. A future automated pipeline could add `prisma migrate deploy` to the Vercel build command, but as of this writing that is a manual, deliberate step a human runs — never assume a code push alone has migrated the database.

### Standard deploy checklist

1. `npx tsc --noEmit` — clean.
2. `npm run lint` — clean (0 errors; pre-existing unused-var warnings in `app/reports/transactions/page.tsx` are known and non-blocking).
3. `npm run build` — clean, confirms every route still compiles/renders.
4. If the change includes a schema migration: apply it to the production Neon database first (`prisma migrate deploy`), confirmed independently of the code push.
5. Commit, push to `main`.
6. Confirm the Vercel dashboard shows the new deployment as "Ready" for the pushed commit.

---

## Recovery Guide (routine, non-disaster scenarios)

### "I deleted the wrong Project/Builder/Locality/Transaction"

If it was a **soft delete** (the normal "Trash"/"Delete" button in the admin list): go to `/admin/trash`, select the entity-type tab, find the row, click **Restore**. Nothing is lost — soft-delete only sets `deletedAt`/`deletedByUserId` and (for Project/Builder/Locality) forces `isPublished: false, isArchived: true`; the row and all its child rows (images, configurations, etc.) are untouched.

If it was a **permanent delete** (only reachable from `/admin/trash`, requires the row to already be in Trash): the database row is genuinely gone, and — for Project/Builder — any Cloudinary media (logo, cover, gallery, brochure) is also genuinely gone (see `docs/architecture-overview.md` §Media pipeline). Recovery options, in order of likelihood:
1. Check `AuditLog` for the row's last known state before deletion (`entityType`/`entityId` match, `action` ending in `.update`) — the `before`/`after` JSON gives you the field values to manually recreate the row, though not its original `id` (see below).
2. If genuinely critical, restore from a Neon point-in-time-recovery snapshot (see Disaster Recovery below) — this is a database-level operation, not an application feature.

**A recreated row will have a new ID.** Anything referencing the old ID (a bookmarked URL, `SavedProject`, an old `AuditLog` entry) will not automatically re-link. This is exactly why permanent delete is ADMIN-gated and Trash-first — routine mistakes should never reach permanent delete in the first place.

### "I need to see who changed what and when"

Every entity's admin edit page has a **History** panel (Project/Builder/Locality/Transaction) reading directly from `AuditLog`, showing action, actor, timestamp, and a field-level before/after diff wherever both were recorded. For a broader view, `/admin` (Dashboard)'s activity feed shows the most recent admin actions platform-wide.

### "The Review Queue has a bad import batch"

`/admin/data-sync/batches/[id]` shows every `IngestLogEntry` for that batch (created/updated/skipped/staged/failed, with messages). Anything still `PENDING` in the Review Queue can be bulk-rejected. Anything already approved and written follows the normal Trash/restore recovery path above — an import approval is just a normal `create`/`update`, indistinguishable afterward from manual admin entry.

---

## Disaster Recovery Notes

### Database (Neon Postgres)

Neon provides point-in-time recovery on its paid tiers (check the current project's plan in the Neon dashboard for the actual retention window). In a genuine data-loss event:
1. Do not run further migrations or writes against the affected branch.
2. Use Neon's branch/restore feature to create a new branch from a pre-incident timestamp.
3. Verify row counts and spot-check a few known entities against the restored branch before repointing `DATABASE_URL`.
4. Repoint `DATABASE_URL` (in Vercel's env vars) only after verification — this requires a new deployment (env var changes need a redeploy to take effect on Vercel).

### Cloudinary (media)

There is **no automated backup of Cloudinary assets** in this project today — the database (`ProjectImage.url` etc.) is the only record of what should exist. If Cloudinary assets are lost independently of the database (a Cloudinary-side incident), the application will render broken image URLs but the catalog data itself is intact and unaffected — this is a direct consequence of images always being stored as URLs, never as bytes in Postgres. Re-uploading replacement images through the normal admin uploaders is the only recovery path; there is no bulk re-upload tool.

### Application code / deployment

Vercel retains every previous deployment — the fastest recovery from a bad deploy is **Vercel's "Instant Rollback"** to the last known-good deployment (a dashboard action, not a code change). This is faster and safer than a `git revert` + new deploy for anything urgent; follow up with the proper `git revert` afterward so `main` reflects reality.

### What this platform does **not** yet have (explicitly, so it isn't assumed)

- No automated database backup verification/restore drills.
- No automated Cloudinary asset backup.
- No staging environment distinct from production.
- No automated rollback trigger (rollback is a manual Vercel dashboard action).
- No incident-response runbook beyond this document.

These are reasonable next investments as the platform scales past its current single-founder-admin stage, not gaps introduced by this documentation pass — recorded here so they're a visible, prioritizable backlog rather than an invisible assumption.
