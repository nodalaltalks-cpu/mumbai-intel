/** Only same-origin relative paths are ever accepted as a post-login redirect target — rejects absolute/protocol-relative URLs to prevent open-redirect via `next`. */
export function sanitizeNextPath(value: string | null | undefined): string {
  if (!value) return "/";
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("://") || value.includes("\\")) return "/";
  return value;
}
