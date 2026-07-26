/** Renders a Schema.org JSON-LD block. `data` must already be plain, serializable JSON — no functions/dates as objects. */
export default function JsonLd({ data }: { data: Record<string, unknown> }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />;
}
