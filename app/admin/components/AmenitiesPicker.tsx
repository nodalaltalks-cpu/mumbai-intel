"use client";

import { useEffect, useRef, useState } from "react";
import { AMENITY_CATEGORIES, AMENITY_CATEGORY_LABEL, type AmenityCategoryValue } from "@/lib/project-meta";
import { createAmenityInlineAction } from "@/lib/actions/amenities";
import InlineEntityCreate from "./InlineEntityCreate";

export interface AmenityOption {
  id: string;
  name: string;
  category: string;
}

export default function AmenitiesPicker({
  amenities,
  defaultSelectedIds,
  onSelectionChange,
}: {
  amenities: AmenityOption[];
  defaultSelectedIds: string[];
  /** Fires after the DOM commits a selection change — needed because an amenity
   * added (and auto-checked) via "+ New Amenity" is a programmatic state
   * update, not a native checkbox click, so it would otherwise never reach
   * ProjectForm's form-level onChange (same class of issue as inline
   * Builder/Locality creation). */
  onSelectionChange?: () => void;
}) {
  const [amenityOptions, setAmenityOptions] = useState(amenities);
  const [checkedIds, setCheckedIds] = useState(new Set(defaultSelectedIds));
  const skipNextRef = useRef(true);
  useEffect(() => {
    if (skipNextRef.current) {
      skipNextRef.current = false;
      return;
    }
    onSelectionChange?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkedIds]);

  const byCategory = AMENITY_CATEGORIES.map((category) => ({
    category,
    items: amenityOptions.filter((a) => a.category === category),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="flex flex-col gap-4">
      {amenityOptions.length === 0 ? <p className="text-xs text-muted">No amenities defined yet.</p> : null}
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
                  checked={checkedIds.has(amenity.id)}
                  onChange={(e) =>
                    setCheckedIds((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(amenity.id);
                      else next.delete(amenity.id);
                      return next;
                    })
                  }
                  className="h-3.5 w-3.5 accent-accent"
                />
                {amenity.name}
              </label>
            ))}
          </div>
        </div>
      ))}

      <div>
        <p className="mb-1 text-[10px] text-muted">
          Don&apos;t see it? Add a unique amenity for this project — it joins the shared list for reuse next time.
        </p>
        <InlineEntityCreate
          label="Amenity"
          action={createAmenityInlineAction}
          onCreated={({ id, name }) => {
            setAmenityOptions((prev) => (prev.some((a) => a.id === id) ? prev : [...prev, { id, name, category: "CONVENIENCE" }]));
            setCheckedIds((prev) => new Set(prev).add(id));
          }}
        />
      </div>
    </div>
  );
}
