export default function MapEmbed({ latitude, longitude }: { latitude: number | null; longitude: number | null }) {
  if (latitude === null || longitude === null) {
    return (
      <div className="flex h-48 items-center justify-center rounded-sm border border-dashed border-border">
        <p className="text-xs text-muted">Enter latitude and longitude to preview the map</p>
      </div>
    );
  }

  const delta = 0.006;
  const bbox = `${longitude - delta},${latitude - delta},${longitude + delta},${latitude + delta}`;
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&marker=${latitude},${longitude}&layer=mapnik`;

  return (
    <div className="overflow-hidden rounded-sm border border-border">
      <iframe title="Project location" src={src} className="h-48 w-full" loading="lazy" />
    </div>
  );
}
