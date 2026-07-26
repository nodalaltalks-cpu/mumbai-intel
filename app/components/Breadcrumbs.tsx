import Link from "next/link";
import JsonLd from "./JsonLd";
import { IconChevronRightSmall } from "./ui/icons";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

/** Renders the visible trail AND its BreadcrumbList structured data from the same `items` — every page that adopts this component gets valid breadcrumb rich results for free. */
export default function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  const siteUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "http://localhost:3000";
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.label,
      ...(item.href ? { item: `${siteUrl}${item.href}` } : {}),
    })),
  };

  return (
    <nav aria-label="Breadcrumb" className="border-b border-border bg-background/95 px-4 py-2 backdrop-blur sm:px-6">
      <JsonLd data={breadcrumbSchema} />
      <ol className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-1.5 text-[11px] text-muted">
        {items.map((item, i) => (
          <li key={i} className="flex items-center gap-1.5">
            {i > 0 ? <IconChevronRightSmall className="h-3 w-3 text-border" /> : null}
            {item.href ? (
              <Link href={item.href} className="transition-colors hover:text-accent">
                {item.label}
              </Link>
            ) : (
              <span className="truncate text-foreground">{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
