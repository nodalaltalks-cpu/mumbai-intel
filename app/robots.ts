import type { MetadataRoute } from "next";

function baseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "http://localhost:3000";
}

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/api/", "/reset-password", "/account"],
    },
    sitemap: `${baseUrl()}/sitemap.xml`,
  };
}
