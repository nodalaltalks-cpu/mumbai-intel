"use client";

import { useActionState } from "react";
import { addProjectFaqAction, deleteProjectFaqAction } from "@/lib/actions/project-faqs";
import { Field, TextareaField } from "./FormField";
import SubmitButton from "./SubmitButton";
import ConfirmButton from "./ConfirmButton";

export interface FaqRow {
  id: string;
  question: string;
  answer: string;
}

export default function ProjectFaqsManager({ projectId, faqs }: { projectId: string; faqs: FaqRow[] }) {
  const action = addProjectFaqAction.bind(null, projectId);
  const [state, formAction] = useActionState(action, { error: undefined });

  return (
    <div className="rounded-sm border border-border bg-surface p-4">
      <h3 className="font-mono text-sm font-semibold text-foreground">FAQs</h3>
      <p className="mt-1 text-xs text-muted">Frequently asked questions shown on the project detail page.</p>

      {faqs.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-2">
          {faqs.map((faq) => (
            <li key={faq.id} className="flex items-start justify-between gap-2 border-t border-border pt-2 first:border-t-0">
              <div>
                <p className="text-xs font-semibold text-foreground">{faq.question}</p>
                <p className="mt-0.5 text-[11px] text-muted">{faq.answer}</p>
              </div>
              <ConfirmButton action={deleteProjectFaqAction.bind(null, faq.id)} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-muted">No FAQs added yet.</p>
      )}

      <form action={formAction} className="mt-4 flex flex-col gap-3 border-t border-border pt-4">
        <Field label="Question" name="question" placeholder="Is the RERA registration valid?" required />
        <TextareaField label="Answer" name="answer" required />
        <div>
          <SubmitButton pendingText="Adding...">Add FAQ</SubmitButton>
        </div>
      </form>
      {state.error ? <p className="mt-2 text-xs text-negative">{state.error}</p> : null}
    </div>
  );
}
