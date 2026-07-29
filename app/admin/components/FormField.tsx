import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

const inputClass =
  "rounded-sm border border-border bg-surface px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none";

/** Red asterisk marking a field as important — distinct from HTML `required`, since "NA" is an accepted answer when the information genuinely isn't available; this only flags that the field matters, it never blocks submission. */
function ImportantMark({ important }: { important?: boolean }) {
  if (!important) return null;
  return (
    <span className="text-negative" title="Important — write NA if this information isn't available">
      *
    </span>
  );
}

export function Field({
  label,
  hint,
  important,
  ...props
}: { label: string; hint?: string; important?: boolean } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] uppercase tracking-wide text-muted">
        {label} <ImportantMark important={important} />
      </span>
      <input {...props} className={`${inputClass} ${props.className ?? ""}`} />
      {hint ? <span className="text-[10px] text-muted">{hint}</span> : null}
    </label>
  );
}

export function SelectField({
  label,
  hint,
  important,
  children,
  ...props
}: { label: string; hint?: string; important?: boolean; children: ReactNode } & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] uppercase tracking-wide text-muted">
        {label} <ImportantMark important={important} />
      </span>
      <select {...props} className={`${inputClass} ${props.className ?? ""}`}>
        {children}
      </select>
      {hint ? <span className="text-[10px] text-muted">{hint}</span> : null}
    </label>
  );
}

export function TextareaField({
  label,
  hint,
  important,
  ...props
}: { label: string; hint?: string; important?: boolean } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] uppercase tracking-wide text-muted">
        {label} <ImportantMark important={important} />
      </span>
      <textarea {...props} className={`${inputClass} min-h-24 resize-y ${props.className ?? ""}`} />
      {hint ? <span className="text-[10px] text-muted">{hint}</span> : null}
    </label>
  );
}

export function CheckboxField({
  label,
  hint,
  ...props
}: { label: string; hint?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex items-center gap-2.5 rounded-sm border border-border bg-surface px-3 py-2.5">
      <input type="checkbox" {...props} className="h-4 w-4 accent-accent" />
      <span className="text-xs text-foreground">{label}</span>
      {hint ? <span className="text-[10px] text-muted">{hint}</span> : null}
    </label>
  );
}

export function FieldGroup({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>;
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div className="rounded-sm border border-negative/40 bg-negative/10 px-3 py-2 text-xs text-negative">
      {message}
    </div>
  );
}
