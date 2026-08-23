"use server";

import { requireMutateSession } from "@/lib/auth/guard";
import { uploadImageFile } from "@/lib/cloudinary";

export interface UploadResult {
  url?: string;
  error?: string;
}

/** Generic upload-only action — returns a hosted URL without touching the database. */
export async function uploadImageAction(formData: FormData): Promise<UploadResult> {
  await requireMutateSession();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "No file provided" };
  }
  // Set by SingleImageUploadField when its `isCoverImage` prop is true (currently only
  // BuilderForm's profile cover image) -- cover images skip compression, everything else
  // sharing this generic upload path (builder logo, notification image) compresses by default.
  const isCoverImage = formData.get("isCoverImage") === "true";

  try {
    const result = await uploadImageFile(file, "mumbai-intel/misc", { skipCompression: isCoverImage });
    return { url: result.url };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Upload failed" };
  }
}
