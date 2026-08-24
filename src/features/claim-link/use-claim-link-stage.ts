// Stage machine for the generate-claim-link flow. `closing` keeps the modal
// mounted with a fade-out class for `MODAL_EXIT_MS` so the CSS animation
// completes before unmount.

import { useCallback, useState } from "react";
import { animationDelay, MODAL_EXIT_MS } from "@/shared/lib/motion";
import { sleep } from "@/shared/lib/timing";
import { useIsMounted } from "@/shared/lib/use-is-mounted";

export type ClaimLinkStage = "form" | "confirm" | "running" | "success" | "closing" | "result";

/// Time the success animation is visible before the modal starts fading.
/// Aligned with `claim-success` CSS so the tick has time to draw. Not an
/// `animationDelay`: this is reading time for the result, which a reduced-motion
/// user needs just the same.
export const SUCCESS_DWELL_MS = 1100;

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

  // The dwell below runs for over a second after the transfer resolves, and it
  // used to keep setting state regardless of whether the component was still
  // mounted. That window is precisely when the link is most at risk of being
  // lost, so it is worth not fighting React over it.
  const isMounted = useIsMounted();

  const setStageIfMounted = useCallback(
    (next: ClaimLinkStage) => {
      if (isMounted()) setStage(next);
    },
    [isMounted],
  );

  const toForm = useCallback(() => setStage("form"), []);
  const toConfirm = useCallback(() => setStage("confirm"), []);

  const runWith = useCallback(
    async <T>(work: () => Promise<T>): Promise<T> => {
      setStage("running");
      try {
        const r = await work();
        setStageIfMounted("success");
        await sleep(SUCCESS_DWELL_MS);
        setStageIfMounted("closing");
        await animationDelay(MODAL_EXIT_MS);
        setStageIfMounted("result");
        return r;
      } catch (err) {
        setStageIfMounted("form");
        throw err;
      }
    },
    [setStageIfMounted],
  );

  return {
    stage,
    modalOpen: MODAL_STAGES.has(stage),
    closing: stage === "closing",
    toForm,
    toConfirm,
    runWith,
  };
}
