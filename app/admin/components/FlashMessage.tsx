export default function FlashMessage({ type, warning }: { type: "created" | "saved" | null; warning?: string }) {
  return (
    <>
      {type ? (
        <div className="mb-4 rounded-sm border border-positive/40 bg-positive/10 px-3 py-2 text-xs text-positive">
          {type === "created" ? "Created successfully." : "Saved successfully."}
        </div>
      ) : null}
      {warning ? (
        <div className="mb-4 rounded-sm border border-negative/40 bg-negative/10 px-3 py-2 text-xs text-negative">{warning}</div>
      ) : null}
    </>
  );
}
