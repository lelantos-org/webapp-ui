import { useEffect, useRef, useState } from "react";
import { animationDelay, MODAL_EXIT_MS, sleep } from "@/shared/lib/motion";

export type LinkStage = "form" | "running" | "success" | "closing" | "result";

/// Reading time for the success tick; not an `animationDelay`, so it holds under reduced motion.
const SUCCESS_DWELL_MS = 1100;

const MODAL_STAGES = new Set<LinkStage>(["running", "success", "closing"]);

export interface LinkStageApi {
  stage: LinkStage;
  modalOpen: boolean;
  closing: boolean;
}

export interface LinkOpState {
  /// The link's transfer is running.
  pending: boolean;
  /// It finished and its link is there to show.
  done: boolean;
}

/// The stage of the generate-claim-link screen, following the op: running, then the success tick,
/// then the result. A screen mounted on an op that already finished opens on its result.
export function useLinkStage({ pending, done }: LinkOpState): LinkStageApi {
  const [stage, setStage] = useState<LinkStage>(() =>
    pending ? "running" : done ? "result" : "form",
  );
  const wasPending = useRef(pending);

  useEffect(() => {
    const finished = wasPending.current && !pending;
    wasPending.current = pending;
    if (pending) {
      setStage("running");
      return;
    }
    if (!done) {
      setStage("form");
      return;
    }
    if (!finished) return;

    let live = true;
    void (async () => {
      setStage("success");
      await sleep(SUCCESS_DWELL_MS);
      if (!live) return;
      setStage("closing");
      await animationDelay(MODAL_EXIT_MS);
      if (live) setStage("result");
    })();
    return () => {
      live = false;
    };
  }, [pending, done]);

  return { stage, modalOpen: MODAL_STAGES.has(stage), closing: stage === "closing" };
}
