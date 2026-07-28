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
      { folder, resource_type: "raw" },
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
 * Inserts Cloudinary's `fl_attachment` delivery flag so the browser performs
 * a real file download (Content-Disposition: attachment) instead of
 * navigating to/rendering the PDF inline — used for the public "Download
 * Brochure" button. Falls back to the original URL if it doesn't match the
 * expected `/upload/` shape (still works, just opens inline instead).
 */
export function toDocumentDownloadUrl(url: string, downloadFileName?: string): string {
  const flag = downloadFileName ? `fl_attachment:${encodeURIComponent(downloadFileName.replace(/\.[^.]+$/, ""))}` : "fl_attachment";
  return url.replace("/upload/", `/upload/${flag}/`);
}
