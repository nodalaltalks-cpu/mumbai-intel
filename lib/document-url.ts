/**
 * Pure string helper — deliberately NOT server-only (unlike lib/cloudinary.ts,
 * which needs SDK credentials) so both server queries and client components
 * (e.g. ProjectCard's brochure download link) can compute the same
 * forced-download URL without a network round trip.
 */
export function toDocumentDownloadUrl(url: string, downloadFileName?: string): string {
  const flag = downloadFileName ? `fl_attachment:${encodeURIComponent(downloadFileName.replace(/\.[^.]+$/, ""))}` : "fl_attachment";
  return url.replace("/upload/", `/upload/${flag}/`);
}
