/**
 * Shared between lib/auth/trash-reauth.ts (server-only, sets/reads the
 * cookie) and proxy.ts (the Edge-compatible request gate, which can't import
 * anything marked "server-only") — kept in its own tiny module so neither
 * side duplicates the literal cookie name/path.
 */
export const TRASH_REAUTH_COOKIE = "mi_trash_reauth";
export const TRASH_REAUTH_COOKIE_PATH = "/admin/trash";
