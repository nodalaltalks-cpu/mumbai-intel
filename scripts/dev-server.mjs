/**
 * Forces the local Next.js server process (dev or start) onto UTC before
 * Next.js -- and therefore Prisma -- ever loads.
 *
 * Root cause this works around: Prisma's `@default(now())` for a `timestamp
 * without time zone` column (every `createdAt`/`updatedAt` in this schema) is
 * generated client-side using the Node process's *local* wall-clock
 * components, not UTC. On a machine whose OS timezone isn't UTC, that writes
 * a value shifted by the local offset (e.g. +4h on an Asia/Dubai machine) --
 * confirmed directly: an explicit `now()` via raw SQL round-trips correctly,
 * but a Prisma `create()` relying on the schema default does not, and the
 * discrepancy exactly matches `Intl.DateTimeFormat().resolvedOptions().timeZone`.
 * Vercel's production/preview runtime is already UTC, so this never surfaces
 * there -- it's purely a local-dev artifact once the OS isn't UTC.
 *
 * TZ has to be set before Next.js's CLI module (and anything it imports,
 * including Prisma) is ever loaded -- setting it later doesn't reliably
 * change Date/Intl behavior in an already-running process. Importing Next's
 * CLI in-process (rather than spawning `next` as a child process) sidesteps
 * Windows .cmd-shim spawning issues entirely while still guaranteeing TZ is
 * set first.
 */
process.env.TZ = "UTC";

process.argv = [process.argv[0], "next", ...process.argv.slice(2)];
await import("next/dist/bin/next");
