import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { beginOp, opKey, opScope, resetOpsForTest, settleOp } from "@/features/tx";
import { useLeaveGuard } from "./use-leave-guard";

const SCOPE = opScope(31337n, "lelantos1me");
const KEY = opKey(SCOPE, "transfer");

/// Whether leaving now would be questioned.
function asked(): boolean {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

beforeEach(() => resetOpsForTest());

describe("useLeaveGuard", () => {
  it("asks before leaving only while a transaction would be lost", () => {
    renderHook(() => useLeaveGuard());
    expect(asked()).toBe(false);

    act(() => beginOp(KEY, { label: "transfer", path: "/send", scope: SCOPE }));
    expect(asked()).toBe(true);

    act(() => settleOp(KEY, { txHash: "0xabc" }));
    expect(asked()).toBe(false);
  });
});
