import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SESSION_KEYS } from "@/shared/lib/storage/keys";
import { sessionStore } from "@/shared/lib/storage/safe";
import { dismissInterrupted, reloadInterruptedForTest, useInterruptedOps } from "./interrupted-ops";
import {
  beginOp,
  failOp,
  localOpKey,
  observeOp,
  opKey,
  resetOpsForTest,
  setOpPhase,
  settleOp,
  startOpSteps,
} from "./op-store";
import { stepsFor } from "./tx-progress";

const SCOPE = "31337:lelantos1me";
const KEY = opKey(SCOPE, "transfer");
const META = { label: "transfer", path: "/send", scope: SCOPE };

function run(phase: "proving" | "submitting") {
  beginOp(KEY, META);
  startOpSteps(KEY, stepsFor("transfer"));
  setOpPhase(KEY, phase);
}

/// What the next page load reports for `SCOPE`.
function afterReload() {
  reloadInterruptedForTest();
  return renderHook(() => useInterruptedOps(SCOPE)).result;
}

beforeEach(() => {
  sessionStore.remove(SESSION_KEYS.opsRunning);
  sessionStore.remove(SESSION_KEYS.opsInterrupted);
  resetOpsForTest();
  reloadInterruptedForTest();
});

afterEach(() => vi.useRealTimers());

describe("interrupted ops", () => {
  it("reports an op the reload cut short before it was handed over", () => {
    run("proving");
    expect(afterReload().current).toMatchObject([{ ...META, maybeSent: false }]);
  });

  it("says the op may have gone through once it reached the handover", () => {
    run("submitting");
    expect(afterReload().current).toMatchObject([{ maybeSent: true }]);
  });

  it("reports nothing for an op that finished, either way, before the reload", () => {
    run("submitting");
    settleOp(KEY, { txHash: "0x1" });
    expect(afterReload().current).toEqual([]);

    run("proving");
    failOp(KEY, new Error("boom"));
    expect(afterReload().current).toEqual([]);
  });

  it("ignores a row's own op, which has no screen to report on", () => {
    const local = localOpKey("r1");
    const release = observeOp(local);
    beginOp(local, META);
    expect(afterReload().current).toEqual([]);
    release();
  });

  it("keeps the report across further reloads, until it is dismissed", () => {
    run("submitting");
    reloadInterruptedForTest();
    // The page after the reload runs nothing; the one after that still reports it.
    resetOpsForTest();
    const ops = afterReload();
    expect(ops.current).toHaveLength(1);

    act(() => dismissInterrupted(SCOPE));
    expect(ops.current).toEqual([]);
    expect(afterReload().current).toEqual([]);
  });

  it("leaves another account's report alone", () => {
    run("submitting");
    expect(afterReload().current).toHaveLength(1);
    act(() => dismissInterrupted("1:someone-else"));
    expect(renderHook(() => useInterruptedOps(SCOPE)).result.current).toHaveLength(1);
  });

  it("drops a report older than an hour", () => {
    vi.useFakeTimers({ now: 0 });
    run("submitting");
    vi.setSystemTime(61 * 60 * 1000);
    expect(afterReload().current).toEqual([]);
  });
});
