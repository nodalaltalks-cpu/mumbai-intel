import { revalidatePath } from "next/cache";

/**
 * The Automatic Update Engine — the single place that knows which public and
 * admin pages can show a given entity's data. Every mutation in lib/actions
 * calls one of these instead of hand-picking revalidatePath calls, so a page
 * added in a later phase (e.g. /market-data) never gets silently skipped the
 * way ad-hoc revalidation calls did before this pass.
 *
 * Why this is enough for "everything updates automatically": every public
 * page in this app renders with `export const dynamic = "force-dynamic"`,
 * so there is no server-side Full Route Cache to go stale in the first
 * place — each navigation always re-queries Postgres. What revalidatePath
 * actually buys us here is invalidating the client-side Router Cache (so an
 * admin who just saved an edit doesn't see a stale cached RSC payload when
 * redirected back to a list), and it future-proofs the app: if caching is
 * ever added to a route, this is the one place that needs to stay correct.
 */

const GLOBAL_PATHS = ["/", "/market-data", "/insights"] as const;

function revalidateMany(paths: string[]) {
  for (const path of paths) revalidatePath(path);
}

export interface EntityRef {
  id?: string;
  slug?: string;
}

export function revalidateProject(ref: EntityRef = {}) {
  revalidateMany([
    "/admin/projects",
    ...(ref.id ? [`/admin/projects/${ref.id}/edit`] : []),
    "/projects",
    ...(ref.slug ? [`/projects/${ref.slug}`] : []),
    "/transactions",
    ...GLOBAL_PATHS,
  ]);
}

export function revalidateBuilder(ref: EntityRef = {}) {
  revalidateMany([
    "/admin/builders",
    ...(ref.id ? [`/admin/builders/${ref.id}/edit`] : []),
    "/builders",
    ...(ref.slug ? [`/builders/${ref.slug}`] : []),
    "/projects",
    "/transactions",
    ...GLOBAL_PATHS,
  ]);
}

export function revalidateLocality(ref: EntityRef = {}) {
  revalidateMany([
    "/admin/localities",
    ...(ref.id ? [`/admin/localities/${ref.id}/edit`] : []),
    "/localities",
    ...(ref.slug ? [`/localities/${ref.slug}`] : []),
    "/projects",
    "/builders",
    "/transactions",
    ...GLOBAL_PATHS,
  ]);
}

export function revalidateTransaction(ref: EntityRef = {}) {
  revalidateMany([
    "/admin/transactions",
    "/transactions",
    ...(ref.id ? [`/transactions/${ref.id}`] : []),
    "/projects",
    "/builders",
    "/localities",
    ...GLOBAL_PATHS,
  ]);
}

/** Infra sync/approval affects every locality's nearby-places section, not one slug. */
export function revalidateInfra() {
  revalidateMany(["/admin/data-sync", "/localities", "/projects", ...GLOBAL_PATHS]);
}
