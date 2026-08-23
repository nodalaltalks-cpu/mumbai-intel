import type { NextConfig } from "next";

const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  // Inert without HTTPS (browsers only ever honor this over a secure connection), so it's
  // safe to send unconditionally including in local dev -- no need to gate on NODE_ENV.
  // The custom domain already gets this from Vercel's platform-level injection, but that's
  // Vercel's *.vercel.app/nodalaltalks.com behavior specifically, not something this app can
  // rely on if it's ever hosted elsewhere, and it doesn't cover includeSubDomains/preload.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

// Production-only: Turbopack's dev HMR client relies on eval/inline scripts
// that a strict CSP would break, so this is skipped in `next dev`. Doesn't
// use script-src/style-src nonces (Next's RSC hydration payload ships as
// inline <script> tags), so 'unsafe-inline' is kept for those — this still
// blocks loading of any *remote* injected script/object, which is the
// meaningful protection against the dangerouslySetInnerHTML rich-text fields.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  // www.googletagmanager.com: GoogleAnalytics (@next/third-parties/google, app/layout.tsx)
  // loads the gtag.js script from here whenever NEXT_PUBLIC_GA_MEASUREMENT_ID is set -- it
  // was previously CSP-blocked (silently, no visible error) since this domain wasn't allowed.
  "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://res.cloudinary.com https://*.tile.openstreetmap.org https://lh3.googleusercontent.com",
  "font-src 'self' data:",
  // *.google-analytics.com / *.analytics.google.com: gtag's actual event-beacon endpoints
  // (same GA integration as script-src above).
  "connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com",
  // Without an explicit frame-src, browsers fall back to default-src 'self' for iframes too --
  // silently blocking BrochureUploader's PDF preview (res.cloudinary.com) and MapEmbed's
  // location preview (openstreetmap.org) with Chrome's generic "This content is blocked"
  // message and no console error, which is what made this look like a Cloudinary/upload bug
  // rather than a CSP one.
  "frame-src 'self' https://res.cloudinary.com https://www.openstreetmap.org",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [{ protocol: "https", hostname: "res.cloudinary.com" }],
  },
  experimental: {
    // Prisma's Neon HTTP adapter issues queries as POST fetches to the same
    // endpoint URL. Next's dev-only HMR fetch cache doesn't distinguish these
    // by body, so it was serving stale/empty results for dynamic routes
    // (e.g. the project edit page 404ing for projects that exist). Disable it.
    serverComponentsHmrCache: false,
    // Default Server Action body limit is 1mb — too small for a real CSV
    // bulk-import upload (admin Data Sync → Import).
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  async headers() {
    const headers = [...SECURITY_HEADERS];
    if (process.env.NODE_ENV === "production") {
      headers.push({ key: "Content-Security-Policy", value: CONTENT_SECURITY_POLICY });
    }
    return [{ source: "/:path*", headers }];
  },
};

export default nextConfig;
