"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import {
  searchNotificationRecipientsAction,
  sendNotificationCampaignAction,
  sendTestNotificationAction,
  type SendNotificationCampaignState,
  type SendTestNotificationState,
} from "@/lib/actions/notification-campaigns";
import type { NotificationRecipientCandidate, NotificationSegment } from "@/lib/analytics/notification-queries";
import { CATEGORY_LABEL } from "@/lib/project-meta";
import { SelectField, Field, TextareaField } from "./FormField";
import SingleImageUploadField from "./SingleImageUploadField";
import SubmitButton from "./SubmitButton";

const NOTIFICATION_CATEGORIES = [
  { value: "NEW_LAUNCH", label: "New Project Launch" },
  { value: "PRICE_OFFER", label: "Price / Discount Offer" },
  { value: "TRENDING_LOCALITY", label: "Trending Locality" },
  { value: "NEW_REPORT", label: "New Report" },
  { value: "MARKET_INSIGHT", label: "New Market Insight" },
  { value: "TRANSACTION_DATA", label: "New Transaction Data" },
  { value: "SAVED_SEARCH_ANNOUNCEMENT", label: "Saved-Search Related" },
  { value: "PRODUCT_UPDATE", label: "Product Update" },
  { value: "GENERAL_UPDATE", label: "General Important Update" },
] as const;

const SEGMENTS: { value: NotificationSegment; label: string }[] = [
  { value: "all", label: "All users" },
  { value: "new", label: "New users (joined last 30 days)" },
  { value: "active", label: "Active users (active in last 30 days)" },
  { value: "inactive", label: "Inactive users (30+ days quiet)" },
  { value: "locality", label: "Interested in a locality" },
  { value: "saved_project", label: "Saved a project" },
  { value: "saved_search", label: "Have a saved search" },
  { value: "profile_complete", label: "Completed their profile" },
  { value: "profile_incomplete", label: "Have not completed their profile" },
  { value: "notifications_enabled", label: "Opted into product notifications" },
  { value: "specific", label: "Specific users" },
];

const initialSendState: SendNotificationCampaignState = {};
const initialTestState: SendTestNotificationState = {};

export default function NotificationComposer({ localities }: { localities: { id: string; name: string }[] }) {
  const [state, formAction] = useActionState(sendNotificationCampaignAction, initialSendState);
  const [testState, testFormAction] = useActionState(sendTestNotificationAction, initialTestState);
  const [isSearching, startSearch] = useTransition();

  const [segment, setSegment] = useState<NotificationSegment>("all");
  const [localityId, setLocalityId] = useState("");
  const [city, setCity] = useState("");
  const [category, setCategory] = useState("");
  const [q, setQ] = useState("");
  const [candidates, setCandidates] = useState<NotificationRecipientCandidate[]>([]);
  const [selected, setSelected] = useState<Map<string, NotificationRecipientCandidate>>(new Map());

  const [notifCategory, setNotifCategory] = useState("");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [actionLabel, setActionLabel] = useState("");
  const [actionUrl, setActionUrl] = useState("");
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    startSearch(async () => {
      const results = await searchNotificationRecipientsAction({
        q: q || undefined,
        segment,
        localityId: segment === "locality" ? localityId || undefined : undefined,
        city: city || undefined,
        category: category || undefined,
      });
      setCandidates(results);
    });
  }, [q, segment, localityId, city, category]);

  function toggle(candidate: NotificationRecipientCandidate) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(candidate.id)) next.delete(candidate.id);
      else next.set(candidate.id, candidate);
      return next;
    });
  }

  function selectAllFiltered() {
    setSelected((prev) => {
      const next = new Map(prev);
      for (const c of candidates) next.set(c.id, c);
      return next;
    });
  }

  function deselectAll() {
    setSelected(new Map());
  }

  function confirmSend(event: React.FormEvent<HTMLFormElement>) {
    if (selected.size > 20) {
      if (!window.confirm(`Send this notification to ${selected.size} users right now? This can't be undone.`)) {
        event.preventDefault();
      }
    }
  }

  const targetFiltersJson = JSON.stringify({ segment, localityId, city, category });

  return (
    <div className="flex flex-col gap-4">
      <form action={formAction} onSubmit={confirmSend} className="flex flex-col gap-4">
        {state.error ? <p className="rounded-sm border border-negative/40 bg-negative/10 px-3 py-2 text-xs text-negative">{state.error}</p> : null}
        {state.success ? <p className="rounded-sm border border-positive/40 bg-positive/10 px-3 py-2 text-xs text-positive">{state.success}</p> : null}

        <input type="hidden" name="targetFilters" value={targetFiltersJson} />

        <div className="rounded-sm border border-border bg-surface p-4">
          <h2 className="mb-3 font-mono text-sm font-semibold text-foreground">Target audience</h2>
          <div className="flex flex-wrap gap-2">
            <select
              value={segment}
              onChange={(e) => setSegment(e.target.value as NotificationSegment)}
              className="rounded-sm border border-border bg-background px-2 py-2 text-xs text-foreground focus:border-accent focus:outline-none"
            >
              {SEGMENTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            {segment === "locality" ? (
              <select
                value={localityId}
                onChange={(e) => setLocalityId(e.target.value)}
                className="rounded-sm border border-border bg-background px-2 py-2 text-xs text-foreground focus:border-accent focus:outline-none"
              >
                <option value="">Choose locality…</option>
                {localities.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            ) : null}
            {segment === "specific" ? (
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search name or email…"
                className="min-w-0 flex-1 rounded-sm border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
              />
            ) : null}
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Narrow by city (optional)"
              className="rounded-sm border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
            />
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="rounded-sm border border-border bg-background px-2 py-2 text-xs text-foreground focus:border-accent focus:outline-none"
            >
              <option value="">Any property type</option>
              {Object.entries(CATEGORY_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-3 flex items-center justify-between text-[11px] text-muted">
            <span>
              {isSearching ? "Searching…" : `${candidates.length} match${candidates.length === 1 ? "" : "es"}`}
              {candidates.length === 500 ? " (showing first 500)" : ""} ·{" "}
              <span className={selected.size > 0 ? "font-semibold text-accent" : ""}>{selected.size} selected</span>
            </span>
            <div className="flex items-center gap-2">
              {selected.size > 0 ? (
                <button type="button" onClick={deselectAll} className="text-muted hover:text-negative hover:underline">
                  Deselect all
                </button>
              ) : null}
              <button type="button" onClick={selectAllFiltered} className="text-accent hover:underline">
                Select all filtered
              </button>
            </div>
          </div>

          <div className="mt-2 max-h-48 overflow-y-auto rounded-sm border border-border">
            {candidates.length === 0 ? (
              <p className="p-3 text-xs text-muted">No matches.</p>
            ) : (
              candidates.map((c) => (
                <label key={c.id} className="flex items-center gap-2 border-b border-border px-3 py-1.5 text-xs last:border-b-0 hover:bg-surface-raised">
                  <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c)} className="h-3.5 w-3.5 accent-accent" />
                  <span className="min-w-0 flex-1 truncate text-foreground">{c.name ?? c.email}</span>
                  <span className="shrink-0 text-muted">{c.city ?? "--"}</span>
                </label>
              ))
            )}
          </div>

          {Array.from(selected.values()).map((c) => (
            <input key={c.id} type="hidden" name="recipientIds" value={c.id} />
          ))}
        </div>

        <div className="rounded-sm border border-border bg-surface p-4">
          <h2 className="mb-3 font-mono text-sm font-semibold text-foreground">Compose</h2>
          <div className="flex flex-col gap-3">
            <SelectField label="Category" name="category" required value={notifCategory} onChange={(e) => setNotifCategory(e.target.value)}>
              <option value="">Choose category…</option>
              {NOTIFICATION_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </SelectField>
            <Field label="Title" name="title" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder='e.g. "New Launch in Powai"' />
            <TextareaField
              label="Short message"
              name="message"
              required
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder='e.g. "3 new projects added in your preferred locality."'
            />
            <SingleImageUploadField name="imageUrl" label="Image (optional)" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field
                label="Action button label (optional)"
                name="actionLabel"
                value={actionLabel}
                onChange={(e) => setActionLabel(e.target.value)}
                placeholder='e.g. "View Project"'
              />
              <Field
                label="Action URL (optional)"
                name="actionUrl"
                value={actionUrl}
                onChange={(e) => setActionUrl(e.target.value)}
                placeholder="/projects/example-project"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPreview((v) => !v)}
            className="rounded-sm border border-border px-3 py-2 text-xs font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent"
          >
            {preview ? "Hide preview" : "Preview"}
          </button>
          <SubmitButton pendingText="Sending…">
            Send to {selected.size} recipient{selected.size === 1 ? "" : "s"}
          </SubmitButton>
        </div>

        {preview ? (
          <div className="mx-auto w-72 overflow-hidden rounded-sm border border-border bg-surface shadow-lg">
            <p className="border-b border-border px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-muted">Notification preview</p>
            <div className="p-3">
              <div className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-foreground">{title || "(no title)"}</p>
                  <p className="mt-0.5 text-[11px] text-muted">{message || "(no message)"}</p>
                </div>
              </div>
              {actionLabel && actionUrl ? (
                <span className="mt-2 inline-block rounded-sm border border-accent/40 bg-accent/10 px-2 py-1 text-[10px] font-mono uppercase tracking-wide text-accent">
                  {actionLabel}
                </span>
              ) : null}
            </div>
          </div>
        ) : null}
      </form>

      <form action={testFormAction} className="flex flex-wrap items-end gap-2 rounded-sm border border-border bg-surface p-4">
        <input type="hidden" name="category" value={notifCategory} />
        <input type="hidden" name="title" value={title} />
        <input type="hidden" name="message" value={message} />
        <input type="hidden" name="actionLabel" value={actionLabel} />
        <input type="hidden" name="actionUrl" value={actionUrl} />
        <div className="flex-1">
          <p className="text-[10px] uppercase tracking-wide text-muted">Send test</p>
          <p className="text-[11px] text-muted">Sends the composed notification to the PublicUser account matching your admin email.</p>
        </div>
        <SubmitButton pendingText="Sending test…">Send test</SubmitButton>
      </form>
      {testState.success ? <p className="text-[11px] text-positive">{testState.success}</p> : null}
      {testState.error ? <p className="text-[11px] text-negative">{testState.error}</p> : null}
    </div>
  );
}
