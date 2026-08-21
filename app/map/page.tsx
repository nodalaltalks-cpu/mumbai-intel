import type { Metadata } from "next";
import { getDeveloperMapMarkers, getInfraMapMarkers, getLocalityMapMarkers, getProjectMapMarkers } from "@/lib/queries";
import Navbar from "@/app/components/Navbar";
import MapExplorer from "@/app/components/map/MapExplorer";

export const metadata: Metadata = {
  title: "Map - NoDalalTalks",
  description: "Explore Mumbai real estate projects, builders and localities on an interactive map with price, status and location filters.",
};
export const dynamic = "force-dynamic";

export default async function MapPage() {
  const [projectMarkers, localityMarkers, developerMarkers, infraMarkers] = await Promise.all([
    getProjectMapMarkers(),
    getLocalityMapMarkers(),
    getDeveloperMapMarkers(),
    getInfraMapMarkers(),
  ]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <Navbar />
      <main id="main-content" className="min-h-0 flex-1">
        <MapExplorer
          projectMarkers={projectMarkers}
          localityMarkers={localityMarkers}
          developerMarkers={developerMarkers}
          infraMarkers={infraMarkers}
        />
      </main>
    </div>
  );
}
