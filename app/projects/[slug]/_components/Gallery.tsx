"use client";

import { useEffect, useRef, useState } from "react";
import Button from "@/app/components/ui/Button";
import { IconChevronLeft, IconChevronRight, IconClose } from "@/app/components/ui/icons";

export interface GalleryImage {
  id: string;
  url: string;
  alt: string | null;
}

export default function Gallery({ images }: { images: GalleryImage[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (openIndex === null) return;
    closeButtonRef.current?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenIndex(null);
      if (event.key === "ArrowLeft") setOpenIndex((i) => (i !== null && i > 0 ? i - 1 : i));
      if (event.key === "ArrowRight") setOpenIndex((i) => (i !== null && i < images.length - 1 ? i + 1 : i));
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [openIndex, images.length]);

  if (images.length === 0) return null;

  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {images.map((image, index) => (
          <button
            key={image.id}
            type="button"
            onClick={() => setOpenIndex(index)}
            className="group relative aspect-[4/3] overflow-hidden rounded-sm border border-border bg-surface transition-colors hover:border-accent/50"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image.url}
              alt={image.alt ?? ""}
              loading="lazy"
              className="h-full w-full object-cover transition-transform group-hover:scale-105"
            />
          </button>
        ))}
      </div>

      {openIndex !== null ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Image gallery"
          className="mi-fade-in fixed inset-0 z-[100] flex items-center justify-center bg-background/90 p-4"
          onClick={() => setOpenIndex(null)}
        >
          <Button
            ref={closeButtonRef}
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setOpenIndex(null)}
            aria-label="Close"
            className="mi-pop-in absolute right-4 top-4"
          >
            <IconClose className="h-3.5 w-3.5" />
            Close
          </Button>
          {openIndex > 0 ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setOpenIndex((i) => (i !== null ? i - 1 : i));
              }}
              aria-label="Previous image"
              className="mi-pop-in absolute left-4 !rounded-full !p-2"
            >
              <IconChevronLeft className="h-4 w-4" />
            </Button>
          ) : null}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={images[openIndex].url}
            alt={images[openIndex].alt ?? ""}
            className="mi-pop-in max-h-[85vh] max-w-[90vw] rounded-sm object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          {openIndex < images.length - 1 ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setOpenIndex((i) => (i !== null ? i + 1 : i));
              }}
              aria-label="Next image"
              className="mi-pop-in absolute right-4 !rounded-full !p-2"
            >
              <IconChevronRight className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
