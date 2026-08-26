/**
 * Gmail (and Googlemail) ignore dots in the local part and ignore anything
 * after a "+" tag — "john.doe@gmail.com", "johndoe@gmail.com", and
 * "john+nodalaltalks@gmail.com" all deliver to the exact same inbox. Without
 * collapsing these to one canonical form, the same person could register
 * multiple "different" accounts on this platform (referral-code farming,
 * duplicate-account abuse) using what is really one email address.
 *
 * Deliberately scoped to gmail.com/googlemail.com only: Yahoo, Outlook, and
 * most other providers do NOT ignore dots, so applying this same collapsing
 * to their addresses would wrongly treat two different real people's
 * accounts as duplicates.
 */
export function canonicalizeEmail(email: string): string {
  const trimmed = email.trim().toLowerCase();
  const atIndex = trimmed.lastIndexOf("@");
  if (atIndex === -1) return trimmed;
  const local = trimmed.slice(0, atIndex);
  const domain = trimmed.slice(atIndex + 1);
  if (domain !== "gmail.com" && domain !== "googlemail.com") return trimmed;
  const withoutTag = local.split("+")[0];
  const withoutDots = withoutTag.replace(/\./g, "");
  return `${withoutDots}@gmail.com`;
}
