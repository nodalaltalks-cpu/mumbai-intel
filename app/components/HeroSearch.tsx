import { getLocalities } from "@/lib/queries";
import RecentSearches from "./RecentSearches";
import SearchBar from "./SearchBar";

export default async function HeroSearch() {
  const localities = await getLocalities();

  return (
    <section className="border-b border-border bg-[radial-gradient(circle_at_top,_rgba(79,70,229,0.08),_transparent_60%)]">
      <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <span className="inline-flex items-center gap-1.5 rounded-sm border border-accent/30 bg-accent/10 px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-accent">
          Research Freely. No Sales Pressure.
        </span>
        <h1 className="mt-4 max-w-2xl font-mono text-3xl font-semibold leading-tight text-foreground sm:text-4xl">
          Find Your Next Home. Without Sales Pressure.
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
          Compare projects, explore verified information, download official brochures, and make informed property
          decisions, without unwanted sales calls.
        </p>
        <div className="mt-8 max-w-2xl">
          <SearchBar
            localities={localities.map((locality) => ({
              slug: locality.slug,
              name: locality.name,
              zoneName: locality.zone?.name ?? null,
            }))}
          />
          <RecentSearches />
        </div>
        <div className="mt-6 flex max-w-2xl flex-wrap gap-x-6 gap-y-2 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="text-accent">&#10003;</span> No Spam Calls
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="text-accent">&#10003;</span> No Phone Number Required
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="text-accent">&#10003;</span> Free Brochure Downloads (No contact details)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="text-accent">&#10003;</span> Live Project Information
          </span>
        </div>
      </div>
    </section>
  );
}
