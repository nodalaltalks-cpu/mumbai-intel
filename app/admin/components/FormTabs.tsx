"use client";

export interface FormTab {
  id: string;
  label: string;
}

export default function FormTabs({
  tabs,
  active,
  onChange,
}: {
  tabs: FormTab[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1 border-b border-border pb-2">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={`rounded-sm px-2.5 py-1.5 text-[11px] font-mono uppercase tracking-wide transition-colors ${
            active === tab.id ? "bg-accent/10 text-accent" : "text-muted hover:bg-surface-raised hover:text-foreground"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
