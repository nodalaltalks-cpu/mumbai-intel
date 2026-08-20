import "server-only";
import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";

let configured = false;

function ensureConfigured() {
  if (configured) return;
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error(
      "Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in .env."
    );
  }
  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });
  configured = true;
}

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8MB
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

export async function uploadImageFile(
  file: File,
  folder: string
): Promise<{ url: string; publicId: string; width: number; height: number }> {
  ensureConfigured();

  if (!ALLOWED_TYPES.has(file.type)) {
    throw new Error(`Unsupported image type "${file.type}". Use JPEG, PNG, WEBP, or AVIF.`);
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("Image is too large. Maximum size is 8MB.");
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const result = await new Promise<UploadApiResponse>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: "image" },
      (error, uploadResult) => {
        if (error || !uploadResult) {
          reject(error ?? new Error("Cloudinary upload failed"));
          return;
        }
        resolve(uploadResult);
      }
    );
    stream.end(buffer);
  });

  return {
    url: result.secure_url,
    publicId: result.public_id,
    width: result.width,
    height: result.height,
  };
}

export async function deleteImageByPublicId(publicId: string): Promise<void> {
  ensureConfigured();
  await cloudinary.uploader.destroy(publicId, { resource_type: "image" });
}

const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024; // 15MB
const ALLOWED_DOCUMENT_TYPES = new Set(["application/pdf"]);

/** Uploads a PDF (brochure, floor-plan sheet, …) as a Cloudinary raw asset. `maxBytes` lets callers (e.g. brochure uploads) enforce their own configurable limit instead of the 15MB default. */
export async function uploadDocumentFile(
  file: File,
  folder: string,
  maxBytes: number = MAX_DOCUMENT_BYTES
): Promise<{ url: string; publicId: string; bytes: number }> {
  ensureConfigured();

  if (!ALLOWED_DOCUMENT_TYPES.has(file.type)) {
    throw new Error(`Unsupported document type "${file.type}". Only PDF is allowed.`);
  }
  if (file.size > maxBytes) {
    throw new Error(`Document is too large. Maximum size is ${Math.round(maxBytes / (1024 * 1024))}MB.`);
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const result = await new Promise<UploadApiResponse>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      // Without `format`, a raw upload gets a public_id with no extension (e.g.
      // ".../brochure-v2/xz93ovoxblbznop1tusj") -- Cloudinary then has no way to know it's a
      // PDF, so it serves it as Content-Type: application/octet-stream with
      // Content-Disposition: attachment, silently forcing a download instead of the inline
      // preview BrochureUploader's iframe expects. `format: "pdf"` gives the delivery URL a
      // real .pdf extension, which is what Cloudinary actually keys Content-Type/Disposition
      // off for raw resources.
      { folder, resource_type: "raw", format: "pdf" },
      (error, uploadResult) => {
        if (error || !uploadResult) {
          reject(error ?? new Error("Cloudinary upload failed"));
          return;
        }
        resolve(uploadResult);
      }
    );
    stream.end(buffer);
  });

  return { url: result.secure_url, publicId: result.public_id, bytes: result.bytes };
}

export async function deleteDocumentByPublicId(publicId: string): Promise<void> {
  ensureConfigured();
  await cloudinary.uploader.destroy(publicId, { resource_type: "raw" });
}

export interface CloudinaryUsage {
  storageBytes: number;
  objectCount: number;
  /** Cloudinary's own reported plan credit usage, when the account has a knowable plan limit — null otherwise. Never estimated. */
  creditsUsedPercent: number | null;
}

/**
 * Real provider-reported storage/usage figures for the System Health page —
 * Cloudinary's Admin API (cloudinary.api.usage()), not used anywhere else in
 * this codebase (everywhere else only uses the upload/transform/delete APIs
 * above). Best-effort: a failed usage call must not break the page that
 * shows it, same convention as every other admin query's safeQuery wrapper.
 */
export async function getCloudinaryUsage(): Promise<CloudinaryUsage | null> {
  ensureConfigured();
  try {
    const usage = await cloudinary.api.usage();
    const creditsUsedPercent =
      typeof usage.credits?.used_percent === "number" ? Math.round(usage.credits.used_percent * 100) / 100 : null;
    return {
      storageBytes: usage.storage?.usage ?? 0,
      objectCount: usage.objects?.usage ?? 0,
      creditsUsedPercent,
    };
  } catch (error) {
    console.error("[cloudinary] failed to fetch usage:", error);
    return null;
  }
}

/** Best-effort: derive a Cloudinary public_id from one of our own secure_urls. */
export function publicIdFromUrl(url: string): string | null {
  const match = url.match(/\/upload\/(?:v\d+\/)?(.+?)\.[a-zA-Z0-9]+$/);
  return match ? match[1] : null;
}

/**
 * Same as `publicIdFromUrl` but for `raw`/`video` resource types, where
 * Cloudinary's public_id includes the file extension (unlike `image`).
 */
export function documentPublicIdFromUrl(url: string): string | null {
  const match = url.match(/\/upload\/(?:v\d+\/)?(.+)$/);
  return match ? match[1] : null;
}

/**
 * A signed, authenticated download URL for a `raw` document (brochure, floor
 * plan sheet…) — hits api.cloudinary.com (signed with our API secret), not
 * the public res.cloudinary.com CDN. This is deliberate, not cosmetic: this
 * Cloudinary account has "restricted media types" security enabled, which
 * denies ALL public delivery of raw/PDF assets outright (verified directly:
 * even the plain, untransformed secure_url 401s with
 * "X-Cld-Error: deny or ACL failure") — so the CDN URL stored on
 * Project.brochureUrl can never be used directly for delivery, transformed
 * or not. The signed download endpoint is Cloudinary's own documented
 * mechanism for exactly this case and bypasses the restriction entirely.
 * Only ever generated for our own cloud's raw/upload assets — refuses
 * anything else, so this can't be turned into an open relay for arbitrary
 * URLs. Doesn't take a filename — the caller (app/api/brochure-download)
 * sets its own Content-Disposition header on the proxied response, so
 * Cloudinary's own attachment naming here is irrelevant to what the user
 * actually sees.
 */
export function generateDocumentDownloadUrl(secureUrl: string): string | null {
  ensureConfigured();
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  if (!cloudName || !secureUrl.startsWith(`https://res.cloudinary.com/${cloudName}/raw/upload/`)) return null;
  const publicId = documentPublicIdFromUrl(secureUrl);
  if (!publicId) return null;
  return cloudinary.utils.private_download_url(publicId, "", {
    resource_type: "raw",
    type: "upload",
    attachment: true,
  });
}

