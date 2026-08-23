import Link from "next/link";
import type { Metadata } from "next";
import { requireAdminSession } from "@/lib/auth/guard";
import { hasValidTrashReauth } from "@/lib/auth/trash-reauth";
import { hasTrashPassword } from "@/lib/actions/trash-auth";
import { logAudit } from "@/lib/audit";
import {
  getTrashedProjects,
  getTrashedBuilders,
  getTrashedLocalities,
  getTrashedTransactions,
  getTrashedContactEnquiries,
} from "@/lib/admin-queries";
import {
  restoreProjectAction,
  permanentlyDeleteProjectAction,
  bulkProjectAction,
  emptyProjectTrashAction,
} from "@/lib/actions/projects";
import {
  restoreBuilderAction,
  permanentlyDeleteBuilderAction,
  bulkBuilderAction,
  emptyBuilderTrashAction,
} from "@/lib/actions/builders";
import {
  restoreLocalityAction,
  permanentlyDeleteLocalityAction,
  bulkLocalityAction,
  emptyLocalityTrashAction,
} from "@/lib/actions/localities";
import {
  restoreTransactionAction,
  permanentlyDeleteTransactionAction,
  bulkTransactionAction,
  emptyTransactionTrashAction,
} from "@/lib/actions/transactions";
import {
  restoreEnquiryAction,
  permanentlyDeleteEnquiryAction,
  bulkEnquiryTrashAction,
  emptyEnquiryTrashAction,
} from "@/lib/actions/contact-enquiries";
import { formatPaise } from "@/lib/format";
import TrashPanel, { type TrashItem } from "@/app/admin/components/TrashPanel";
import TrashReauthGate from "@/app/admin/components/TrashReauthGate";

export const metadata: Metadata = { title: "Trash — NoDalalTalks Admin" };
export const dynamic = "force-dynamic";

const TABS = [
  { key: "projects", label: "Projects" },
  { key: "builders", label: "Builders" },
  { key: "localities", label: "Localities" },
  { key: "transactions", label: "Transactions" },
  { key: "enquiries", label: "Contact Enquiries" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default async function AdminTrashPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string }>;
}) {
  // Founder-only, full stop (Section 18) -- viewing this page at all previously only required
  // requireSession() (any logged-in role), even though the mutating actions were already
  // ADMIN-gated. That mismatch is fixed here.
  const session = await requireAdminSession();

  if (!(await hasValidTrashReauth(session.userId))) {
    await logAudit(session.userId, "trash.access_denied_needs_reauth", "Trash", session.userId);
    const trashPasswordSet = await hasTrashPassword(session.userId);
    return (
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="font-mono text-lg font-semibold text-foreground">Trash</h1>
          <p className="text-xs text-muted">Soft-deleted records — restore or permanently delete.</p>
        </div>
        <TrashReauthGate hasTrashPassword={trashPasswordSet} />
      </div>
    );
  }
  await logAudit(session.userId, "trash.access", "Trash", session.userId);

  const isAdmin = true;
  const params = await searchParams;
  const tab = (TABS.some((t) => t.key === params.tab) ? params.tab : "projects") as TabKey;
  const q = params.q?.trim() || undefined;

  function tabHref(key: TabKey) {
    const qs = new URLSearchParams();
    qs.set("tab", key);
    if (q) qs.set("q", q);
    return `/admin/trash?${qs.toString()}`;
  }

  let items: TrashItem[] = [];
  let panel: React.ReactNode = null;

  if (tab === "projects") {
    const rows = await getTrashedProjects({ q });
    items = rows.map((r) => ({
      id: r.id,
      label: r.name,
      sublabel: [r.locality.name, r.builder?.name, r.reraNumber].filter(Boolean).join(" · "),
      deletedAt: r.deletedAt as Date,
      deletedByName: r.deletedByName,
    }));
    panel = (
      <TrashPanel
        items={items}
        isAdmin={isAdmin}
        restoreAction={restoreProjectAction}
        permanentDeleteAction={permanentlyDeleteProjectAction}
        bulkAction={bulkProjectAction}
        emptyTrashAction={emptyProjectTrashAction}
      />
    );
  } else if (tab === "builders") {
    const rows = await getTrashedBuilders({ q });
    items = rows.map((r) => ({
      id: r.id,
      label: r.name,
      sublabel: [r.headquarters, `${r._count.projects} project(s)`].filter(Boolean).join(" · "),
      deletedAt: r.deletedAt as Date,
      deletedByName: r.deletedByName,
    }));
    panel = (
      <TrashPanel
        items={items}
        isAdmin={isAdmin}
        restoreAction={restoreBuilderAction}
        permanentDeleteAction={permanentlyDeleteBuilderAction}
        bulkAction={bulkBuilderAction}
        emptyTrashAction={emptyBuilderTrashAction}
      />
    );
  } else if (tab === "localities") {
    const rows = await getTrashedLocalities({ q });
    items = rows.map((r) => ({
      id: r.id,
      label: r.name,
      sublabel: `${r._count.projects} project(s) · ${r._count.transactions} transaction(s)`,
      deletedAt: r.deletedAt as Date,
      deletedByName: r.deletedByName,
    }));
    panel = (
      <TrashPanel
        items={items}
        isAdmin={isAdmin}
        restoreAction={restoreLocalityAction}
        permanentDeleteAction={permanentlyDeleteLocalityAction}
        bulkAction={bulkLocalityAction}
        emptyTrashAction={emptyLocalityTrashAction}
      />
    );
  } else if (tab === "transactions") {
    const rows = await getTrashedTransactions({ q });
    items = rows.map((r) => ({
      id: r.id,
      label: r.project?.name ?? r.locality.name,
      sublabel: `${r.locality.name} · ${formatPaise(r.valuePaise)}`,
      deletedAt: r.deletedAt as Date,
      deletedByName: r.deletedByName,
    }));
    panel = (
      <TrashPanel
        items={items}
        isAdmin={isAdmin}
        restoreAction={restoreTransactionAction}
        permanentDeleteAction={permanentlyDeleteTransactionAction}
        bulkAction={bulkTransactionAction}
        emptyTrashAction={emptyTransactionTrashAction}
      />
    );
  } else {
    const rows = await getTrashedContactEnquiries({ q });
    items = rows.map((r) => ({
      id: r.id,
      label: r.name,
      sublabel: [r.email, r.subject, r.status].filter(Boolean).join(" · "),
      deletedAt: r.deletedAt as Date,
      deletedByName: r.deletedByName,
    }));
    panel = (
      <TrashPanel
        items={items}
        isAdmin={isAdmin}
        restoreAction={restoreEnquiryAction}
        permanentDeleteAction={permanentlyDeleteEnquiryAction}
        bulkAction={bulkEnquiryTrashAction}
        emptyTrashAction={emptyEnquiryTrashAction}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-mono text-lg font-semibold text-foreground">Trash</h1>
        <p className="text-xs text-muted">Soft-deleted records — restore or permanently delete.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-2">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={tabHref(t.key)}
            className={`rounded-sm px-3 py-1.5 text-xs font-mono uppercase tracking-wide ${
              tab === t.key ? "bg-accent/10 text-accent" : "text-muted hover:bg-surface-raised hover:text-foreground"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <form className="flex items-center gap-2">
        <input type="hidden" name="tab" value={tab} />
        <input
          type="text"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search trash..."
          className="w-full max-w-xs rounded-sm border border-border bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted"
        />
        <button type="submit" className="rounded-sm border border-border px-3 py-1.5 text-[11px] font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent">
          Search
        </button>
      </form>

      {panel}
    </div>
  );
}
