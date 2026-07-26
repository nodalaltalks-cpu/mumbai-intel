"use client";

import { AMENITY_CATEGORIES, AMENITY_CATEGORY_LABEL, type AmenityCategoryValue } from "@/lib/project-meta";

export interface AmenityOption {
  id: string;
  name: string;
  category: string;
}

export default function AmenitiesPicker({
  amenities,
  defaultSelectedIds,
}: {
  amenities: AmenityOption[];
  defaultSelectedIds: string[];
}) {
  const selected = new Set(defaultSelectedIds);
  const byCategory = AMENITY_CATEGORIES.map((category) => ({
    category,
    items: amenities.filter((a) => a.category === category),
  })).filter((group) => group.items.length > 0);

  if (amenities.length === 0) {
    return <p className="text-xs text-muted">No amenities defined yet.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {byCategory.map((group) => (
        <div key={group.category}>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted/70">
            {AMENITY_CATEGORY_LABEL[group.category as AmenityCategoryValue]}
          </p>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {group.items.map((amenity) => (
              <label
                key={amenity.id}
                className="flex items-center gap-2 rounded-sm border border-border bg-surface px-2 py-1.5 text-xs text-foreground hover:border-accent/40"
              >
                <input
                  type="checkbox"
                  name="amenityIds"
                  value={amenity.id}
                  defaultChecked={selected.has(amenity.id)}
                  className="h-3.5 w-3.5 accent-accent"
                />
                {amenity.name}
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
