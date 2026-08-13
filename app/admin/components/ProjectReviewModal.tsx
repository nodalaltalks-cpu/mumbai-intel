"use client";

import type { ReactNode } from "react";
import Dialog from "@/app/components/ui/Dialog";

export interface ReviewRow {
  label: string;
  value: string;
  important?: boolean;
}

export interface ReviewSection {
  title: string;
  rows: ReviewRow[];
}

/**
 * A read-only snapshot of every tab's current values, shown right before the
 * form actually submits — lets an admin catch a wrong field before it's
 * saved instead of after. The real submit control (a SubmitButton, so
 * useFormStatus still works) is passed in as `actions` rather than owned
 * here, since it must stay inside the surrounding <form> to fire the actual
 * server action.
 */
export default function ProjectReviewModal({
  sections,
  onClose,
  actions,
}: {
  sections: ReviewSection[];
  onClose: () => void;
  actions: ReactNode;
}) {
  return (
    <Dialog
      title="Review before submitting"
      onClose={onClose}
      maxWidth="max-w-2xl"
      footer={
        <div className="flex flex-col gap-2">
          <div className="rounded-sm border border-accent/30 bg-accent/5 px-3 py-2 text-[11px] text-muted">
            By submitting, you confirm the details above are accurate to the best of your knowledge. This isn&apos;t
            final — every field here (and every card below it) can be edited again anytime after saving.
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-sm border border-border px-3 py-1.5 text-xs font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent"
            >
              Go back and edit
            </button>
            {actions}
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-xs text-muted">
          Check every section below. Fields marked <span className="text-negative">*</span> are important — if one is
          blank or shows <span className="font-mono text-foreground">NA</span>, make sure that&apos;s intentional
          before you continue.
        </p>
        {sections.map((section) => (
          <div key={section.title} className="overflow-hidden rounded-sm border border-border">
            <p className="border-b border-border bg-background px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-wide text-foreground">
              {section.title}
            </p>
            <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 bg-surface p-3 sm:grid-cols-2">
              {section.rows.map((row) => {
                const isBlank = !row.value;
                return (
                  <div key={row.label} className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="shrink-0 text-muted">
                      {row.label} {row.important ? <span className="text-negative">*</span> : null}
                    </span>
                    <span
                      className={`min-w-0 break-words text-right font-mono ${row.important && isBlank ? "text-negative" : "text-foreground"}`}
                    >
                      {row.value || "--"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Dialog>
  );
}
