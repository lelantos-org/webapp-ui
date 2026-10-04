import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  beginOp,
  clearOpOutcome,
  failOp,
  opKey,
  opScope,
  resetOpsForTest,
  setOpPhase,
  settleOp,
  startOpSteps,
  useOp,
  useOpNeedsTab,
  useOpsInFlight,
} from "./op-store";
import { stepsFor } from "./tx-progress";
import { useTxProgress } from "./use-tx-progress";

const toast = vi.hoisted(() => ({ success: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
vi.mock("./prove-eta", () => ({ recordProveDuration: vi.fn() }));

const SCOPE = opScope(31337n, "lelantos1me");
const KEY = opKey(SCOPE, "transfer");
const META = { label: "transfer", path: "/send", scope: SCOPE };

beforeEach(() => {
  vi.clearAllMocks();
  resetOpsForTest();
});

describe("a keyed op", () => {
  it("keeps its stepper and outcome when the form that started it unmounts", () => {
    const first = renderHook(() => useTxProgress(KEY));
    act(() => {
      beginOp(KEY, META);
      first.result.current.start(stepsFor("transfer"));
      first.result.current.set("proving");
    });
    first.unmount();

    // The op carries on with nobody watching.
    act(() => setOpPhase(KEY, "submitting"));

    const back = renderHook(() => ({ progress: useTxProgress(KEY), op: useOp(KEY) }));
    expect(back.result.current.progress.phase).toBe("submitting");
    expect(back.result.current.op.status).toBe("running");

    act(() => settleOp(KEY, { txHash: "0xabc" }));
    expect(back.result.current.op).toMatchObject({ status: "done", result: { txHash: "0xabc" } });
  });

  it("is replaced by the next op under the same key", () => {
    beginOp(KEY, META);
    failOp(KEY, new Error("boom"));
    beginOp(KEY, META);
    const { result } = renderHook(() => useOp(KEY));
    expect(result.current).toMatchObject({ status: "running", error: undefined, steps: [] });
  });

  it("forgets its outcome on its own, leaving the stepper to its reset", () => {
    beginOp(KEY, META);
    startOpSteps(KEY, stepsFor("transfer"));
    settleOp(KEY, { txHash: "0xabc" });
    clearOpOutcome(KEY);
    const { result } = renderHook(() => useOp(KEY));
    expect(result.current).toMatchObject({ status: "idle", result: undefined });
    expect(result.current.steps.length).toBeGreaterThan(0);
  });
});

describe("a finished op", () => {
  it("is not reopened by a step reported late", () => {
    beginOp(KEY, META);
    startOpSteps(KEY, stepsFor("transfer", { coldProver: true }));
    setOpPhase(KEY, "fetching-prover");
    setOpPhase(KEY, "failed");
    // The prover finished loading after the op had already failed.
    setOpPhase(KEY, "proving");

    const { result } = renderHook(() => useOp(KEY));
    expect(result.current).toMatchObject({ phase: "failed", failedAt: "fetching-prover" });
    expect(result.current.provingSince).toBeUndefined();
  });

  it("times the proof from when proving starts, not from the prover download", () => {
    vi.useFakeTimers();
    try {
      beginOp(KEY, META);
      startOpSteps(KEY, stepsFor("transfer", { coldProver: true }));
      setOpPhase(KEY, "fetching-prover");
      vi.advanceTimersByTime(40_000);
      const { result } = renderHook(() => useOp(KEY));
      expect(result.current.provingSince).toBeUndefined();

      act(() => setOpPhase(KEY, "proving"));
      expect(result.current.provingSince).toBe(Date.now());
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("a merge the spend reports", () => {
  it("joins the steps when it happens, after picking the funds", () => {
    beginOp(KEY, META);
    startOpSteps(KEY, stepsFor("transfer"));
    setOpPhase(KEY, "preparing");
    const { result } = renderHook(() => useOp(KEY));
    expect(result.current.steps.map((s) => s.id)).not.toContain("consolidating");

    act(() => setOpPhase(KEY, "consolidating"));
    expect(result.current.steps.map((s) => s.id)).toEqual([
      "preparing",
      "consolidating",
      "proving",
      "submitting",
      "mined",
    ]);
    expect(result.current.phase).toBe("consolidating");
  });
});

describe("the amount an op moves", () => {
  it("stays with the op for a form that comes back with empty fields", () => {
    const first = renderHook(() => useTxProgress(KEY));
    act(() => {
      beginOp(KEY, META);
      first.result.current.noteAmount("250 USDC");
      first.result.current.start(stepsFor("transfer"));
    });
    first.unmount();

    const back = renderHook(() => useTxProgress(KEY));
    expect(back.result.current.amount).toBe("250 USDC");

    act(() => back.result.current.reset());
    expect(back.result.current.amount).toBeUndefined();
  });
});

describe("an op without a key", () => {
  it("belongs to its caller and goes with it", () => {
    const a = renderHook(() => useTxProgress());
    const b = renderHook(() => useTxProgress());
    act(() => a.result.current.start(stepsFor("transfer")));
    expect(b.result.current.steps).toEqual([]);

    a.unmount();
    const again = renderHook(() => useTxProgress());
    expect(again.result.current.steps).toEqual([]);
  });

  it("ignores a late phase from an op whose caller is gone", () => {
    const a = renderHook(() => useTxProgress());
    const { set, start } = a.result.current;
    act(() => start(stepsFor("transfer")));
    a.unmount();

    set("mined");
    expect(toast.success).not.toHaveBeenCalled();
    expect(renderHook(() => useOpNeedsTab()).result.current).toBe(false);
  });
});

describe("announcing a success nobody is watching", () => {
  const finish = (endedAs: "mined" | "failed" | "unknown") => {
    beginOp(KEY, META);
    startOpSteps(KEY, stepsFor("transfer"));
    setOpPhase(KEY, endedAs);
  };

  it("toasts once the op confirms with its form gone", () => {
    finish("mined");
    expect(toast.success).toHaveBeenCalledWith("transfer confirmed");
  });

  it("stays quiet while a form is there to show it", () => {
    renderHook(() => useTxProgress(KEY));
    act(() => finish("mined"));
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("leaves failures and unobserved outcomes to their own toasts", () => {
    finish("failed");
    finish("unknown");
    expect(toast.success).not.toHaveBeenCalled();
  });
});

describe("useOpsInFlight", () => {
  it("lists this account's ops until their steps finish", () => {
    const { result } = renderHook(() => useOpsInFlight(SCOPE));
    expect(result.current).toEqual([]);

    act(() => {
      beginOp(KEY, META);
      startOpSteps(KEY, stepsFor("transfer"));
      beginOp(opKey(opScope(31337n, "lelantos1else"), "transfer"), { ...META, scope: "other" });
    });
    expect(result.current.map((op) => op.path)).toEqual(["/send"]);

    // Broadcast, with the tracker still walking the steps.
    act(() => settleOp(KEY, { txHash: "0xabc" }));
    expect(result.current).toHaveLength(1);

    act(() => setOpPhase(KEY, "mined"));
    expect(result.current).toEqual([]);
  });

  it("drops an op that failed", () => {
    const { result } = renderHook(() => useOpsInFlight(SCOPE));
    act(() => {
      beginOp(KEY, META);
      failOp(KEY, new Error("boom"));
    });
    expect(result.current).toEqual([]);
  });
});

describe("useOpNeedsTab", () => {
  it("holds the tab for a spend until it resolves", () => {
    const { result } = renderHook(() => useOpNeedsTab());
    expect(result.current).toBe(false);

    act(() => {
      beginOp(KEY, META);
      startOpSteps(KEY, stepsFor("transfer"));
      setOpPhase(KEY, "proving");
    });
    expect(result.current).toBe(true);

    act(() => settleOp(KEY, { txHash: "0xabc" }));
    expect(result.current).toBe(false);
  });

  it("lets go of a deposit once the wallet has sent it", () => {
    const { result } = renderHook(() => useOpNeedsTab());
    act(() => {
      beginOp(KEY, { ...META, label: "deposit" });
      startOpSteps(KEY, stepsFor("deposit", { asEth: true }));
      setOpPhase(KEY, "signing");
    });
    expect(result.current).toBe(true);

    act(() => setOpPhase(KEY, "broadcast"));
    expect(result.current).toBe(false);
  });
});
