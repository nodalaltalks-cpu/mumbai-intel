import type { Metadata } from "next";
import { getAmenities } from "@/lib/admin-queries";
import BuilderForm from "@/app/admin/components/BuilderForm";

export const metadata: Metadata = { title: "New Builder — Mumbai Intel Admin" };
export const dynamic = "force-dynamic";

export default async function NewBuilderPage() {
  const amenities = await getAmenities();

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <h1 className="font-mono text-lg font-semibold text-foreground">New Builder</h1>
      <div className="rounded-sm border border-border bg-surface p-4">
        <BuilderForm amenities={amenities} />
      </div>
    </div>
  );
}
