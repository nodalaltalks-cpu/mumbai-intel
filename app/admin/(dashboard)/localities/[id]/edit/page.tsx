import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAmenities, getAuditHistory, getLocalityForEdit, getLocalityNearbyInfra, getZones } from "@/lib/admin-queries";
import LocalityForm from "@/app/admin/components/LocalityForm";
import NearbyInfraPanel from "@/app/admin/components/NearbyInfraPanel";
import CatalogueInfraAssetForm from "@/app/admin/components/CatalogueInfraAssetForm";
import MicroMarketManager from "@/app/admin/components/MicroMarketManager";
import LocalityGalleryUploader from "@/app/admin/components/LocalityGalleryUploader";
import AuditHistory from "@/app/admin/components/AuditHistory";

export const metadata: Metadata = { title: "Edit Locality — Mumbai Intel Admin" };
export const dynamic = "force-dynamic";

export default async function EditLocalityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [locality, zones, amenities, nearbyInfra, history] = await Promise.all([
    getLocalityForEdit(id),
    getZones(),
    getAmenities(),
    getLocalityNearbyInfra(id),
    getAuditHistory("Locality", id),
  ]);
  if (!locality) notFound();

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-mono text-lg font-semibold text-foreground">Edit Locality</h1>
          <p className="text-xs text-muted">{locality.name}</p>
        </div>
        <Link
          href={`/admin/localities/${locality.id}/preview`}
          className="rounded-sm border border-border px-3 py-1.5 text-xs font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent"
        >
          Preview
        </Link>
      </div>

      <div className="rounded-sm border border-border bg-surface p-4">
        <LocalityForm
          locality={{
            id: locality.id,
            slug: locality.slug,
            name: locality.name,
            zoneId: locality.zoneId,
            pincode: locality.pincode,
            description: locality.description,
            coverImageUrl: locality.coverImageUrl,
            centroidLat: locality.centroidLat,
            centroidLng: locality.centroidLng,
            avgPricePerSqftPaise: locality.avgPricePerSqftPaise,
            rentalYieldPercent: locality.rentalYieldPercent,
            growthPercentYoy: locality.growthPercentYoy,
            connectivityNotes: locality.connectivityNotes,
            investmentScore: locality.investmentScore,
            endUserScore: locality.endUserScore,
            luxuryScore: locality.luxuryScore,
            familyScore: locality.familyScore,
            advantages: locality.advantages,
            disadvantages: locality.disadvantages,
            metaTitle: locality.metaTitle,
            metaDescription: locality.metaDescription,
            canonicalUrl: locality.canonicalUrl,
            ogImageUrl: locality.ogImageUrl,
            isPublished: locality.isPublished,
            isFeatured: locality.isFeatured,
            amenityIds: locality.amenityIds,
          }}
          zones={zones}
          amenities={amenities}
        />
      </div>

      <MicroMarketManager localityId={locality.id} microMarkets={locality.microMarkets} />

      <NearbyInfraPanel items={nearbyInfra} />
      <CatalogueInfraAssetForm cityId={locality.cityId} />

      <LocalityGalleryUploader localityId={locality.id} images={locality.images} />

      <AuditHistory logs={history} />
    </div>
  );
}
