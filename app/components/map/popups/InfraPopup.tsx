import type { InfraMapMarker } from "@/lib/map/types";
import { INFRA_TYPE_LABEL, SOURCE_CLASS, SOURCE_LABEL, type InfraTypeValue } from "@/lib/project-meta";

export default function InfraPopup({ marker }: { marker: InfraMapMarker }) {
  return (
    <div className="flex w-56 flex-col gap-2 p-1 font-sans">
      <div>
        <p className="text-[10px] uppercase tracking-wide text-muted">{INFRA_TYPE_LABEL[marker.type as InfraTypeValue]}</p>
        <h3 className="font-mono text-sm font-semibold text-foreground">{marker.name}</h3>
        {marker.detail ? <p className="text-xs text-muted">{marker.detail}</p> : null}
      </div>
      <span className={`w-fit rounded-sm border px-1.5 py-0.5 text-[9px] uppercase tracking-wide ${SOURCE_CLASS[marker.dataSource]}`}>
        {SOURCE_LABEL[marker.dataSource]}
      </span>
    </div>
  );
}
