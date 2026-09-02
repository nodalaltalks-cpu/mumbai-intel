/**
 * Phase 55 Part C — pure URL-shape heuristics that decide whether a sitemap
 * URL is WORTH FETCHING as a possible project page. Deliberately dumb and
 * conservative: this never claims a URL IS a project, only that it's a
 * plausible candidate worth spending a real page fetch on. The actual
 * project-or-not decision happens downstream once the page is fetched and
 * its real content (JSON-LD/title/meta) is inspected (Part C/D — discovery
 * only needs enough signal to filter which pages to fetch at all, on
 * developer sitemaps that can run into the hundreds of URLs).
 */

const POSITIVE_PATH_SEGMENTS = ["residential", "residences", "project", "projects", "property", "properties", "homes"];

const NEGATIVE_PATH_SEGMENTS = [
  "blog",
  "blogs",
  "article",
  "articles",
  "news",
  "press",
  "media",
  "career",
  "careers",
  "jobs",
  "event",
  "events",
  "podcast",
  "podcasts",
  "video",
  "videos",
  "about",
  "about-us",
  "contact",
  "contact-us",
  "investor",
  "investors",
  "csr",
  "privacy",
  "privacy-policy",
  "legal",
  "terms",
  "terms-and-conditions",
  "disclaimer",
  "sitemap",
  "faq",
  "faqs",
  "gallery",
  "testimonial",
  "testimonials",
  "award",
  "awards",
  "leadership",
  "management",
  "team",
  "our-team",
  "board",
  "board-of-directors",
  "sustainability",
  "csr-initiatives",
  "commercial", // Part F: commercial-only pages are explicitly excluded from this residential-discovery pipeline
  "office-space",
  "office-spaces",
  "retail",
  // Phase 56 rerun -- real false positive: Oberoi Realty publishes its own
  // schools (e.g. /social-infrastructure/oberoi-international-school-...)
  // as shallow, distinctively-named leaf slugs that otherwise pass the
  // fallback leaf-page heuristic below. A school is never a residential
  // project regardless of how project-shaped its own page looks.
  "social-infrastructure",
  "school",
  "schools",
  "login",
  "register",
  "sitemap.xml",
  // Phase 56 rerun -- real investor-relations / press pages staged as fake
  // "projects" because their own single-segment slug (e.g. "investor-corner",
  // "shareholder-corner", "financial-results", "commercial-projects",
  // "newsroom", "blogpost", "blog_detail") never exactly equals one of the
  // segments above — only ever CONTAINS it (see the substring check below).
  "financial",
  "shareholder",
  // Phase 56 rerun -- real Rustomjee marketing/financing pages ("exclusive
  // payment plan", "financing") that describe HOW to pay across every
  // project generically, never one specific project.
  "payment-plan",
  "financing",
];

const NEGATIVE_FILE_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png", ".webp", ".svg", ".xml", ".gz", ".css", ".js", ".ico", ".mp4"];

export interface CandidateUrlClassification {
  likely: boolean;
  reason: string;
}

function pathSegments(pathname: string): string[] {
  return pathname
    .toLowerCase()
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Pure. Classifies one URL as a plausible project-page candidate worth
 * fetching, purely from its shape — never from page content (not fetched
 * yet at this stage).
 */
export function classifyCandidateUrl(rawUrl: string): CandidateUrlClassification {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { likely: false, reason: "Not a parseable absolute URL." };
  }

  const lowerUrl = rawUrl.toLowerCase();
  for (const ext of NEGATIVE_FILE_EXTENSIONS) {
    if (lowerUrl.endsWith(ext)) return { likely: false, reason: `Non-page file extension (${ext}).` };
  }

  const segments = pathSegments(url.pathname);
  if (segments.length === 0) return { likely: false, reason: "Homepage / root URL, not a specific page." };

  // Phase 56 rerun -- real developer sites almost never use a negative
  // keyword as a WHOLE segment on its own; they fold it into a compound
  // slug instead ("blog_detail", "blogpost", "newsroom", "investor-corner",
  // "commercial-property-in-mumbai"). An exact-equality check let every one
  // of those straight through as a "distinctive leaf slug" below, so this is
  // now a substring check against the full lowercased pathname.
  const lowerPathname = url.pathname.toLowerCase();
  for (const negative of NEGATIVE_PATH_SEGMENTS) {
    if (lowerPathname.includes(negative)) return { likely: false, reason: `Path contains "${negative}", matching a known non-project page pattern.` };
  }

  const hasPositiveSegment = segments.some((s) => POSITIVE_PATH_SEGMENTS.includes(s));
  if (hasPositiveSegment) return { likely: true, reason: `Path contains a residential/project index segment (${segments.join("/")}).` };

  // No negative signal and no positive index segment: a leaf page one or two
  // segments deep under the root, with a distinctive-looking slug (contains a
  // hyphen or is reasonably long) is still a plausible individual project
  // page on developer sites that skip an explicit "/residential/" prefix
  // (e.g. Piramal's own /piramal-mahalaxmi, verified real in Phase 54).
  const leafSegment = segments[segments.length - 1];
  if (segments.length <= 2 && (leafSegment.includes("-") || leafSegment.length >= 8)) {
    return { likely: true, reason: `Shallow, distinctively-named leaf path (${segments.join("/")}) — plausible individual project slug.` };
  }

  return { likely: false, reason: "No positive project-page signal found in URL shape." };
}
