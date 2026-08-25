"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { trainModelNowAction, setRankingModeAction } from "@/lib/actions/recommendation-ml";
import type { RankingMode } from "@/lib/recommendations/ml/mode";

const MODE_LABEL: Record<RankingMode, string> = {
  PHASE1_ONLY: "Phase 1 only (deterministic ranking)",
  ML_SHADOW: "ML shadow mode (Phase 1 shown, ML scored silently)",
  ML_ENABLED: "ML enabled (re-ranks when confident, else falls back to Phase 1)",
};

export default function MlControls({ currentMode }: { currentMode: RankingMode }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [trainResult, setTrainResult] = useState<string | null>(null);

  function changeMode(mode: RankingMode) {
    startTransition(async () => {
      await setRankingModeAction(mode);
      router.refresh();
    });
  }

  function trainNow() {
    setTrainResult(null);
    startTransition(async () => {
      const result = await trainModelNowAction();
      if (result.error) setTrainResult(`Error: ${result.error}`);
      else setTrainResult(`${result.version}: ${result.status}`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-sm border border-border bg-surface p-4">
      <div>
        <p className="text-[10px] uppercase tracking-wide text-muted">Ranking mode (Part 18 — rollback lever, no deployment needed)</p>
        <div className="mt-2 flex flex-col gap-1.5">
          {(Object.keys(MODE_LABEL) as RankingMode[]).map((mode) => (
            <label key={mode} className="flex items-center gap-2 text-xs text-foreground">
              <input type="radio" name="ranking_mode" checked={currentMode === mode} disabled={isPending} onChange={() => changeMode(mode)} />
              {MODE_LABEL[mode]}
            </label>
          ))}
        </div>
      </div>
      <div className="border-t border-border pt-3">
        <p className="text-[10px] uppercase tracking-wide text-muted">Manual training (Part 19 — no auto-retrain cron exists at this data volume)</p>
        <button
          type="button"
          onClick={trainNow}
          disabled={isPending}
          className="mt-2 rounded-sm border border-border px-3 py-1.5 text-[11px] font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent disabled:opacity-50"
        >
          {isPending ? "Working…" : "Train Model Now"}
        </button>
        {trainResult ? <p className="mt-2 text-[11px] text-muted">{trainResult}</p> : null}
      </div>
    </div>
  );
}
