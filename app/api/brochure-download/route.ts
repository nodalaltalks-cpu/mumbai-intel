import { NextResponse, type NextRequest } from "next/server";
import { generateDocumentDownloadUrl } from "@/lib/cloudinary";

/**
 * Proxies a brochure/document download through our own server instead of
 * linking the browser straight to Cloudinary. Two reasons this exists,
 * not one:
 *  1. This account's raw/PDF assets can't be delivered from the public CDN
 *     at all (see generateDocumentDownloadUrl's comment) — only a signed,
 *     authenticated URL works, and that signing has to happen server-side
 *     with our API secret.
 *  2. Proxying the bytes (rather than 302-redirecting to Cloudinary) lets
 *     us set our own Content-Disposition filename reliably and keeps the
 *     Cloudinary implementation out of the browser's address bar/network
 *     tab, per the "don't expose internal Cloudinary implementation"
 *     requirement.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  const filename = request.nextUrl.searchParams.get("filename") || "brochure.pdf";
  if (!url) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }

  const signedUrl = generateDocumentDownloadUrl(url);
  if (!signedUrl) {
    return NextResponse.json({ error: "Invalid document URL" }, { status: 400 });
  }

  const upstream = await fetch(signedUrl);
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "Document unavailable" }, { status: 502 });
  }

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename.replace(/["\\]/g, "")}"`,
      ...(upstream.headers.get("content-length") ? { "Content-Length": upstream.headers.get("content-length")! } : {}),
    },
  });
}
