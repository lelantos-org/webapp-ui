import { useCallback, useState } from "react";
import { useIsMounted } from "@/shared/hooks/use-is-mounted";
import { animationDelay, MODAL_EXIT_MS, sleep } from "@/shared/lib/motion";

export type LinkStage = "form" | "running" | "success" | "closing" | "result";

/// Reading time for the success tick; not an `animationDelay`, so it holds under reduced motion.
const SUCCESS_DWELL_MS = 1100;

const MODAL_STAGES = new Set<LinkStage>(["running", "success", "closing"]);

export interface LinkStageApi {
  stage: LinkStage;
  modalOpen: boolean;
  closing: boolean;
  toForm(): void;
  /// Runs `work` through running → success → closing → result.
  runWith<T>(work: () => Promise<T>): Promise<T>;
}

/// Stage machine for the generate-claim-link modal.
export function useLinkStage(): LinkStageApi {
  const [stage, setStage] = useState<LinkStage>("form");

  const isMounted = useIsMounted();

  const setStageIfMounted = useCallback(
    (next: LinkStage) => {
      if (isMounted()) setStage(next);
    },
    [isMounted],
  );

  const toForm = useCallback(() => setStage("form"), []);

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
    runWith,
  };
}
