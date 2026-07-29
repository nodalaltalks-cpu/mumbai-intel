import type { Metadata } from "next";
import { getAmenities, getZones } from "@/lib/admin-queries";
import LocalityForm from "@/app/admin/components/LocalityForm";

export const metadata: Metadata = { title: "New Locality — NoDalalTalks Admin" };
export const dynamic = "force-dynamic";

export default async function NewLocalityPage() {
  const [zones, amenities] = await Promise.all([getZones(), getAmenities()]);

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <div>
        <h1 className="font-mono text-lg font-semibold text-foreground">New Locality</h1>
        <p className="text-xs text-muted">Micro markets and the gallery become available after the locality is created.</p>
      </div>
      <div className="rounded-sm border border-border bg-surface p-4">
        <LocalityForm zones={zones} amenities={amenities} />
      </div>
    </div>
  );
}
