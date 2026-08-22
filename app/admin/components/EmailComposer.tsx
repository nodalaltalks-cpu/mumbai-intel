"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import {
  searchRecipientsAction,
  sendCampaignAction,
  processCampaignQueueAction,
  sendTestEmailAction,
  type SendCampaignState,
} from "@/lib/actions/email-campaigns";
import type { EmailRecipientCandidate } from "@/lib/analytics/email-queries";
import { SelectField, Field } from "./FormField";
import RichTextEditor from "./RichTextEditor";
import SubmitButton from "./SubmitButton";

const CAMPAIGN_TYPES = [
  { value: "NEWSLETTER", label: "Newsletter" },
  { value: "RESEARCH_UPDATE", label: "Research / Market Update" },
  { value: "MARKET_REPORT", label: "Transaction / Market Report" },
  { value: "PRODUCT_COMMUNICATION", label: "Product Communication" },
  { value: "REPORT_COMMUNICATION", label: "Report Communication" },
] as const;

const initialState: SendCampaignState = {};

export default function EmailComposer({ localities }: { localities: { id: string; name: string }[] }) {
  const [state, formAction] = useActionState(sendCampaignAction, initialState);
  const [isSearching, startSearch] = useTransition();

  const [q, setQ] = useState("");
  const [segment, setSegment] = useState("");
  const [localityId, setLocalityId] = useState("");
  const [candidates, setCandidates] = useState<EmailRecipientCandidate[]>([]);
  const [selected, setSelected] = useState<Map<string, EmailRecipientCandidate>>(new Map());
  const [preview, setPreview] = useState(false);
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [testEmail, setTestEmail] = useState("");
  const [testState, setTestState] = useState<{ error?: string; success?: string }>({});
  const [isSendingTest, startTestTransition] = useTransition();
  const [sendProgress, setSendProgress] = useState<{ sent: number; failed: number; remaining: number } | null>(null);
  const draining = useRef(false);

  useEffect(() => {
    startSearch(async () => {
      const results = await searchRecipientsAction({ q: q || undefined, segment: segment || undefined, localityId: localityId || undefined });
      setCandidates(results);
    });
  }, [q, segment, localityId]);

  // Once sendCampaignAction queues a campaign, immediately drain it batch-by-batch — this is
  // what makes "queued" still feel like "sent" from the founder's chair (Section 23: real
  // automation, not a fake instant "sent" state — each batch is a real awaited SMTP send).
  useEffect(() => {
    if (!state.campaignId || draining.current) return;
    draining.current = true;
    let cancelled = false;
    let totalSent = 0;
    let totalFailed = 0;

    async function drain(campaignId: string) {
      for (;;) {
        const result = await processCampaignQueueAction(campaignId);
        if (cancelled) return;
        if (result.error) {
          setSendProgress(null);
          return;
        }
        totalSent += result.sent ?? 0;
        totalFailed += result.failed ?? 0;
        setSendProgress({ sent: totalSent, failed: totalFailed, remaining: result.remaining ?? 0 });
        if (!result.remaining) return;
      }
    }
    void drain(state.campaignId);
    return () => {
      cancelled = true;
    };
  }, [state.campaignId]);

  function handleSendTest() {
    setTestState({});
    startTestTransition(async () => {
      const result = await sendTestEmailAction(testEmail, subject, bodyHtml);
      setTestState(result);
    });
  }

  function toggle(candidate: EmailRecipientCandidate) {
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
    if (!window.confirm(`Send this campaign to ${selected.size} recipient${selected.size === 1 ? "" : "s"}? This cannot be undone.`)) {
      event.preventDefault();
    }
  }

  return (
    <form action={formAction} onSubmit={confirmSend} className="flex flex-col gap-4">
      {state.error ? <p className="rounded-sm border border-negative/40 bg-negative/10 px-3 py-2 text-xs text-negative">{state.error}</p> : null}
      {state.success ? <p className="rounded-sm border border-positive/40 bg-positive/10 px-3 py-2 text-xs text-positive">{state.success}</p> : null}

      <div className="rounded-sm border border-border bg-surface p-4">
        <h2 className="mb-3 font-mono text-sm font-semibold text-foreground">Recipients</h2>
        <div className="flex flex-wrap gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name or email…"
            className="min-w-0 flex-1 rounded-sm border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
          />
          <select
            value={segment}
            onChange={(e) => setSegment(e.target.value)}
            className="rounded-sm border border-border bg-background px-2 py-2 text-xs text-foreground focus:border-accent focus:outline-none"
          >
            <option value="">All registered users</option>
            <option value="newsletter">Newsletter subscribers</option>
            <option value="saved_projects">Users with saved projects</option>
          </select>
          <select
            value={localityId}
            onChange={(e) => setLocalityId(e.target.value)}
            className="rounded-sm border border-border bg-background px-2 py-2 text-xs text-foreground focus:border-accent focus:outline-none"
          >
            <option value="">Any locality interest</option>
            {localities.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-3 flex items-center justify-between text-[11px] text-muted">
          <span>
            {isSearching ? "Searching…" : `${candidates.length} match${candidates.length === 1 ? "" : "es"}`}
            {candidates.length === 200 ? " (showing first 200)" : ""} ·{" "}
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
                <span className="shrink-0 text-muted">{c.email}</span>
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
          <SelectField label="Campaign type" name="type" required>
            {CAMPAIGN_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </SelectField>
          <Field label="Subject" name="subject" required value={subject} onChange={(e) => setSubject(e.target.value)} />
          <RichTextEditor name="bodyHtml" label="Body" onChange={setBodyHtml} />
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-border pt-3">
          <div className="flex-1">
            <label className="mb-1 block text-[10px] uppercase tracking-wide text-muted">Send test email</label>
            <input
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-sm border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={handleSendTest}
            disabled={isSendingTest || !testEmail || !subject || !bodyHtml}
            className="shrink-0 rounded-sm border border-border px-3 py-2 text-xs font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent disabled:opacity-50"
          >
            {isSendingTest ? "Sending test…" : "Send test"}
          </button>
        </div>
        {testState.success ? <p className="mt-2 text-[11px] text-positive">{testState.success}</p> : null}
        {testState.error ? <p className="mt-2 text-[11px] text-negative">{testState.error}</p> : null}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setPreview((v) => !v)}
          className="rounded-sm border border-border px-3 py-2 text-xs font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent"
        >
          {preview ? "Hide preview" : "Preview"}
        </button>
        <SubmitButton pendingText="Queuing…">Send to {selected.size} recipient{selected.size === 1 ? "" : "s"}</SubmitButton>
      </div>

      {sendProgress ? (
        <p className="text-[11px] text-muted">
          Sending… {sendProgress.sent} sent, {sendProgress.failed} failed
          {sendProgress.remaining > 0 ? `, ${sendProgress.remaining} remaining` : " — done."}
        </p>
      ) : null}

      {preview ? (
        <div className="rounded-sm border border-border bg-surface p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted">Subject</p>
          <p className="mb-3 font-mono text-sm text-foreground">{subject || "(no subject)"}</p>
          <p className="text-[10px] uppercase tracking-wide text-muted">Body</p>
          <div className="prose-invert mt-1 text-sm text-foreground" dangerouslySetInnerHTML={{ __html: bodyHtml || "<p>(empty)</p>" }} />
        </div>
      ) : null}
    </form>
  );
}
