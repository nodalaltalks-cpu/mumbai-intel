import type { Metadata } from "next";
import { getAllImagesAdmin, getProjectsForSelect } from "@/lib/admin-queries";
import AllImagesManager from "@/app/admin/components/AllImagesManager";

export const metadata: Metadata = { title: "Image Upload — Mumbai Intel Admin" };
export const dynamic = "force-dynamic";

export default async function AdminImagesPage() {
  const [images, projects] = await Promise.all([getAllImagesAdmin(), getProjectsForSelect()]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-mono text-lg font-semibold text-foreground">Image Upload</h1>
        <p className="text-xs text-muted">Images are hosted on Cloudinary and attached to a project</p>
      </div>
      <AllImagesManager projects={projects} images={images} />
    </div>
  );
}
