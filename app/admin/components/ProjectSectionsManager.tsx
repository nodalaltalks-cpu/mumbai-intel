"use client";

import { useActionState } from "react";
import { addProjectSectionAction, deleteProjectSectionAction } from "@/lib/actions/project-sections";
import { Field } from "./FormField";
import RichTextEditor from "./RichTextEditor";
import SubmitButton from "./SubmitButton";
import ConfirmButton from "./ConfirmButton";

export interface SectionRow {
  id: string;
  title: string;
  bodyHtml: string;
}

export default function ProjectSectionsManager({ projectId, sections }: { projectId: string; sections: SectionRow[] }) {
  const action = addProjectSectionAction.bind(null, projectId);
  const [state, formAction] = useActionState(action, { error: undefined });

  return (
    <div className="rounded-sm border border-border bg-surface p-4">
      <h3 className="font-mono text-sm font-semibold text-foreground">Custom sections</h3>
      <p className="mt-1 text-xs text-muted">Open-ended rich-text blocks beyond the main description — &quot;Why this location&quot;, etc.</p>

      {sections.length > 0 ? (
        <div className="mt-3 flex flex-col gap-3">
          {sections.map((section) => (
            <div key={section.id} className="rounded-sm border border-border bg-background p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-semibold text-foreground">{section.title}</p>
                <ConfirmButton action={deleteProjectSectionAction.bind(null, section.id)} />
              </div>
              <div
                className="prose-invert mt-1.5 text-[11px] text-muted [&_a]:text-accent [&_p]:my-1"
                dangerouslySetInnerHTML={{ __html: section.bodyHtml }}
              />
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted">No custom sections added yet.</p>
      )}

      <form key={sections.length} action={formAction} className="mt-4 flex flex-col gap-3 border-t border-border pt-4">
        <Field label="Section title" name="title" placeholder="Why this location" required />
        <RichTextEditor label="Body" name="bodyHtml" defaultValue="" />
        <div>
          <SubmitButton pendingText="Adding...">Add section</SubmitButton>
        </div>
      </form>
      {state.error ? <p className="mt-2 text-xs text-negative">{state.error}</p> : null}
    </div>
  );
}
