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

  try {
    const result = await uploadImageFile(file, "mumbai-intel/misc");
    return { url: result.url };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Upload failed" };
  }
}
