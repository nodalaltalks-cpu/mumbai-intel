"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setModelStatusAction } from "@/lib/actions/recommendation-ml";
import type { RecommendationModelStatus } from "@prisma/client";

export default function ModelStatusButton({ modelVersionId, targetStatus, label }: { modelVersionId: string; targetStatus: RecommendationModelStatus; label: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function apply() {
    startTransition(async () => {
      await setModelStatusAction(modelVersionId, targetStatus);
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={apply}
      disabled={isPending}
      className="rounded-sm border border-border px-2 py-1 text-[10px] font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent disabled:opacity-50"
    >
      {label}
    </button>
  );
}
