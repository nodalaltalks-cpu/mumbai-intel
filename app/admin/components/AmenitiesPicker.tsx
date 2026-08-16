"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { AMENITY_CATEGORIES, AMENITY_CATEGORY_LABEL, type AmenityCategoryValue } from "@/lib/project-meta";
import { createAmenityInlineAction } from "@/lib/actions/amenities";

/** Reverse of AMENITY_CATEGORY_LABEL — so picking a suggested built-in label ("Safety &
 * Security") from the datalist stores the existing raw value ("SAFETY") instead of creating a
 * second, fragmented category. Only exact label matches reverse-map; anything else is genuinely
 * new custom text and gets stored exactly as typed. */
const CATEGORY_LABEL_TO_KEY: Record<string, string> = Object.fromEntries(
  Object.entries(AMENITY_CATEGORY_LABEL).map(([key, label]) => [label, key])
);

export interface AmenityOption {
  id: string;
  name: string;
  category: string;
}

export default function AmenitiesPicker({
  amenities,
  defaultSelectedIds,
  onSelectionChange,
  isProjectContext,
  projectId,
}: {
  amenities: AmenityOption[];
  defaultSelectedIds: string[];
  /** Fires after the DOM commits a selection change — needed because an amenity
   * added (and auto-checked) via "+ New Amenity" is a programmatic state
   * update, not a native checkbox click, so it would otherwise never reach
   * ProjectForm's form-level onChange (same class of issue as inline
   * Builder/Locality creation). */
  onSelectionChange?: () => void;
  /** Only passed by ProjectForm (as `true`, always -- even before the project is saved, when
   * projectId below is still undefined). Builder and Locality forms never pass this, so their
   * "+ New Amenity" keeps adding to the shared catalogue exactly as before. */
  isProjectContext?: boolean;
  /** The project's id once it exists. When isProjectContext is true but this is still
   * undefined (a brand-new, not-yet-saved project), "+ New Amenity" is disabled rather than
   * silently falling back to creating a shared-catalogue entry. */
  projectId?: string;
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

  // Categories aren't a fixed set anymore (see the Amenity model's own comment) -- group by
  // whatever's actually present: built-ins first in their established order, then any custom
  // section names an admin has typed, alphabetically.
  const presentCategories = Array.from(new Set(amenityOptions.map((a) => a.category)));
  const customCategories = presentCategories.filter((c) => !(AMENITY_CATEGORIES as readonly string[]).includes(c)).sort();
  const orderedCategories = [...AMENITY_CATEGORIES.filter((c) => presentCategories.includes(c)), ...customCategories];
  const byCategory = orderedCategories.map((category) => ({
    category,
    items: amenityOptions.filter((a) => a.category === category),
  }));
  const selectedAmenities = amenityOptions.filter((a) => checkedIds.has(a.id));

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, startCreateTransition] = useTransition();

  function submitNewAmenity() {
    setCreateError(null);
    const trimmedCategory = newCategory.trim();
    const categoryToSubmit = CATEGORY_LABEL_TO_KEY[trimmedCategory] ?? trimmedCategory;
    startCreateTransition(async () => {
      const result = await createAmenityInlineAction(newName, projectId, categoryToSubmit);
      if (result.error) {
        setCreateError(result.error);
        return;
      }
      if (result.id && result.name) {
        const category = result.category ?? "CONVENIENCE";
        setAmenityOptions((prev) => (prev.some((a) => a.id === result.id) ? prev : [...prev, { id: result.id!, name: result.name!, category }]));
        setCheckedIds((prev) => new Set(prev).add(result.id!));
      }
      setNewName("");
      setNewCategory("");
      setShowCreateForm(false);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* This project's actual selection — everything below is the shared catalogue to pick more from, not what's live on the page. */}
      <div className="rounded-sm border border-accent/30 bg-accent/5 p-3">
        <p className="text-[10px] uppercase tracking-wide text-muted">
          Added to this project ({selectedAmenities.length})
        </p>
        {selectedAmenities.length > 0 ? (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {selectedAmenities.map((a) => (
              <span key={a.id} className="rounded-sm border border-accent/40 bg-surface px-2 py-1 text-xs text-foreground">
                {a.name}
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-1 text-xs text-muted">None yet — check any amenity below to add it to this project only.</p>
        )}
      </div>

      {amenityOptions.length === 0 ? (
        <p className="text-xs text-muted">No amenities defined yet.</p>
      ) : (
        <p className="text-[10px] uppercase tracking-wide text-muted">Shared catalogue — check to add, uncheck to remove from this project</p>
      )}
      {byCategory.map((group) => (
        <div key={group.category}>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted/70">
            {AMENITY_CATEGORY_LABEL[group.category as AmenityCategoryValue] ?? group.category}
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
        {isProjectContext && !projectId ? (
          <p className="text-xs text-muted">Save this project first to add a custom amenity for it.</p>
        ) : !showCreateForm ? (
          <button
            type="button"
            onClick={() => setShowCreateForm(true)}
            className="text-[11px] font-mono uppercase tracking-wide text-accent hover:underline"
          >
            + New Amenity
          </button>
        ) : (
          <div className="mt-1.5 flex flex-col gap-1.5">
            <p className="text-[10px] text-muted">
              {isProjectContext
                ? "Add a one-off amenity for this project only — it won't appear anywhere else."
                : "Add a unique amenity — it joins the shared list for reuse next time."}
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Amenity name"
                className="min-w-0 flex-1 rounded-sm border border-border bg-surface px-2 py-1 text-xs text-foreground focus:border-accent focus:outline-none"
              />
              <input
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="Section (optional — defaults to Convenience)"
                list="amenity-category-suggestions"
                className="min-w-0 flex-1 rounded-sm border border-border bg-surface px-2 py-1 text-xs text-foreground focus:border-accent focus:outline-none"
              />
              <datalist id="amenity-category-suggestions">
                {orderedCategories.map((c) => (
                  <option key={c} value={AMENITY_CATEGORY_LABEL[c as AmenityCategoryValue] ?? c} />
                ))}
              </datalist>
              <button
                type="button"
                disabled={isCreating || !newName.trim()}
                onClick={submitNewAmenity}
                className="rounded-sm border border-accent/40 bg-accent/10 px-2 py-1 text-[10px] font-mono uppercase tracking-wide text-accent hover:bg-accent/20 disabled:opacity-60"
              >
                {isCreating ? "…" : "Add"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCreateForm(false);
                  setCreateError(null);
                }}
                className="rounded-sm border border-border px-2 py-1 text-[10px] font-mono uppercase tracking-wide text-muted hover:border-negative hover:text-negative"
              >
                Cancel
              </button>
            </div>
            {createError ? <span className="text-[10px] text-negative">{createError}</span> : null}
          </div>
        )}
      </div>
    </div>
  );
}
