/** Generic "row label + N right-aligned metric columns" table — reused for every report's Historical Data section. */
export default function HistoricalTable({
  columnLabels,
  rows,
}: {
  columnLabels: string[];
  rows: { label: string; values: string[] }[];
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted">No historical data recorded yet.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-sm border border-border">
      <table className="w-full min-w-[480px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-border bg-surface text-[10px] uppercase tracking-wide text-muted">
            <th className="px-3 py-2 font-medium">Period</th>
            {columnLabels.map((label) => (
              <th key={label} className="px-3 py-2 text-right font-medium">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border transition-colors last:border-b-0 hover:bg-surface-raised">
              <td className="px-3 py-2 font-mono text-foreground">{row.label}</td>
              {row.values.map((value, j) => (
                <td key={j} className="px-3 py-2 text-right font-mono text-muted">
                  {value}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
