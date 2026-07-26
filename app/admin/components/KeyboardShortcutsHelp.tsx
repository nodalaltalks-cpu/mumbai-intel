const SHORTCUTS = [
  { keys: "⌘/Ctrl + K", description: "Open global search" },
  { keys: "?", description: "Show this shortcuts panel" },
  { keys: "Esc", description: "Close any open panel" },
  { keys: "↑ / ↓", description: "Navigate search results" },
  { keys: "Enter", description: "Open the highlighted result" },
];

export default function KeyboardShortcutsHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70" onClick={onClose}>
      <div
        className="w-full max-w-sm overflow-hidden rounded-md border border-border bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="font-mono text-sm font-semibold text-foreground">Keyboard shortcuts</h2>
          <button type="button" onClick={onClose} className="text-[10px] uppercase tracking-wide text-muted hover:text-foreground">
            Esc
          </button>
        </div>
        <ul className="flex flex-col gap-2 p-4">
          {SHORTCUTS.map((s) => (
            <li key={s.keys} className="flex items-center justify-between text-xs">
              <span className="text-muted">{s.description}</span>
              <kbd className="rounded-sm border border-border bg-surface-raised px-1.5 py-0.5 font-mono text-[10px] text-foreground">
                {s.keys}
              </kbd>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
