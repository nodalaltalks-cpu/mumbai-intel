/**
 * Fine-grained permission keys layered on top of the existing ADMIN/EDITOR/
 * VIEWER role (Section 7). No "server-only" here (unlike lib/auth/permissions.ts,
 * which re-exports these) since UserEditForm — the permissions checkbox editor —
 * is a Client Component and needs this list too, same reasoning as
 * lib/analytics/period-constants.ts's split from period.ts.
 */
export const PERMISSION_GROUPS = [
  {
    key: "projects",
    label: "Projects",
    permissions: [
      { key: "projects.view", label: "View projects" },
      { key: "projects.create", label: "Create projects" },
      { key: "projects.edit", label: "Edit projects" },
      { key: "projects.delete", label: "Delete / archive projects" },
    ],
  },
  {
    key: "transactions",
    label: "Transactions",
    permissions: [
      { key: "transactions.view", label: "View transactions" },
      { key: "transactions.create", label: "Create transactions" },
      { key: "transactions.edit", label: "Edit transactions" },
      { key: "transactions.delete", label: "Delete / archive transactions" },
    ],
  },
  {
    key: "localities",
    label: "Localities",
    permissions: [
      { key: "localities.add", label: "Add locality" },
      { key: "localities.edit", label: "Edit locality" },
    ],
  },
  {
    key: "reports",
    label: "Reports",
    permissions: [
      { key: "reports.view", label: "View reports" },
      { key: "reports.review", label: "Review reports" },
      { key: "reports.approve", label: "Approve reports" },
      { key: "reports.reject", label: "Reject reports" },
    ],
  },
  {
    key: "users",
    label: "Users",
    permissions: [
      { key: "users.view", label: "View users" },
      { key: "users.view_activity", label: "View user activity" },
      { key: "users.manage_notifications", label: "Manage notifications" },
    ],
  },
  {
    key: "campaigns",
    label: "Campaigns",
    permissions: [
      { key: "campaigns.create", label: "Create campaign" },
      { key: "campaigns.edit", label: "Edit campaign" },
      { key: "campaigns.send", label: "Send campaign" },
    ],
  },
  {
    key: "analytics",
    label: "Analytics",
    permissions: [{ key: "analytics.view", label: "View analytics" }],
  },
  {
    key: "content",
    label: "Content",
    permissions: [{ key: "content.edit", label: "Edit platform content" }],
  },
] as const;

export const ALL_PERMISSION_KEYS = PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.key));
export type PermissionKey = (typeof ALL_PERMISSION_KEYS)[number];

export function isValidPermissionKey(value: string): value is PermissionKey {
  return (ALL_PERMISSION_KEYS as readonly string[]).includes(value);
}
