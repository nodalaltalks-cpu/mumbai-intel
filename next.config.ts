import type { NextConfig } from "next";

const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

// Production-only: Turbopack's dev HMR client relies on eval/inline scripts
// that a strict CSP would break, so this is skipped in `next dev`. Doesn't
// use script-src/style-src nonces (Next's RSC hydration payload ships as
// inline <script> tags), so 'unsafe-inline' is kept for those — this still
// blocks loading of any *remote* injected script/object, which is the
// meaningful protection against the dangerouslySetInnerHTML rich-text fields.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://res.cloudinary.com https://*.tile.openstreetmap.org https://lh3.googleusercontent.com",
  "font-src 'self' data:",
  "connect-src 'self'",
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
