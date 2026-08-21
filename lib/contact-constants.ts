/**
 * Not in lib/actions/contact.ts: a file with a top-level "use server"
 * directive may only export async functions -- a plain constant exported
 * from one silently resolves to `undefined` on the client (no build/type
 * error) instead of failing loudly. Same bug class already found once this
 * session for PAYMENT_MILESTONE_PRESETS; same fix, a plain constants file.
 */
export const CONTACT_SUBJECTS = ["General Question", "Data Correction", "Partnership", "Report a Bug", "Other"] as const;
