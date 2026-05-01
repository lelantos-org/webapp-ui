// Stage machine for the generate-claim-link flow. `closing` keeps the modal
// mounted with a fade-out class for FADE_OUT_MS so the CSS animation
// completes before unmount.

import { useCallback, useState } from "react";
import { sleep } from "@/shared/lib/timing";

export type ClaimLinkStage = "form" | "confirm" | "running" | "success" | "closing" | "result";

/// Time the success animation is visible before the modal starts fading.
/// Aligned with `claim-success` CSS so the tick has time to draw.
export const SUCCESS_DWELL_MS = 1100;

/// Modal fade-out duration. Matches `setup-overlay--fade-out` CSS.
export const FADE_OUT_MS = 240;

/// Stages during which the modal portal stays mounted.
const MODAL_STAGES = new Set<ClaimLinkStage>(["confirm", "running", "success", "closing"]);

export interface ClaimLinkStageApi {
  stage: ClaimLinkStage;
  modalOpen: boolean;
  closing: boolean;
  toForm(): void;
  toConfirm(): void;
  /// Async transition: running → success → closing → result; manages the
  /// post-success dwell + fade-out windows.
  runWith<T>(work: () => Promise<T>): Promise<T>;
}

export function useClaimLinkStage(): ClaimLinkStageApi {
  const [stage, setStage] = useState<ClaimLinkStage>("form");

  const toForm = useCallback(() => setStage("form"), []);
  const toConfirm = useCallback(() => setStage("confirm"), []);

  const runWith = useCallback(async <T>(work: () => Promise<T>): Promise<T> => {
    setStage("running");
    try {
      const r = await work();
      setStage("success");
      await sleep(SUCCESS_DWELL_MS);
      setStage("closing");
      await sleep(FADE_OUT_MS);
      setStage("result");
      return r;
    } catch (err) {
      setStage("form");
      throw err;
    }
  }, []);

  return {
    stage,
    modalOpen: MODAL_STAGES.has(stage),
    closing: stage === "closing",
    toForm,
    toConfirm,
    runWith,
  };
}
