export default function FlashMessage({ type }: { type: "created" | "saved" | null }) {
  if (!type) return null;
  const message = type === "created" ? "Created successfully." : "Saved successfully.";
  return (
    <div className="mb-4 rounded-sm border border-positive/40 bg-positive/10 px-3 py-2 text-xs text-positive">
      {message}
    </div>
  );
}
