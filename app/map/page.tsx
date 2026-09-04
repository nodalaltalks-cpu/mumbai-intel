import type { Metadata } from "next";
import { getInfraMapMarkers, getLocalityMapMarkers } from "@/lib/queries";
import Navbar from "@/app/components/Navbar";
import MapExplorer from "@/app/components/map/MapExplorer";

export const metadata: Metadata = {
  title: "Map - NoDalalTalks",
  description: "Explore Mumbai localities and infrastructure on an interactive map.",
};
export const dynamic = "force-dynamic";

export default async function MapPage() {
  const [localityMarkers, infraMarkers] = await Promise.all([getLocalityMapMarkers(), getInfraMapMarkers()]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <Navbar />
      <main id="main-content" className="min-h-0 flex-1">
        <MapExplorer localityMarkers={localityMarkers} infraMarkers={infraMarkers} />
      </main>
    </div>
  );
}
