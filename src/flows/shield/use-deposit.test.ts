// @vitest-environment jsdom
// The three paths a shield takes, each with its own stepper and wallet prompts:
// native coin, an AllowanceTransfer window, and the per-deposit Permit2 witness.

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TxPhase } from "@/features/tx";
import { useDeposit } from "./use-deposit";

const h = vi.hoisted(() => ({
  spec: undefined as
    | undefined
    | { run(actions: unknown, input: unknown, progress: unknown): Promise<unknown> },
  allowanceTransfer: false,
  needsApproval: false,
  log: [] as string[],
}));

vi.mock("@lelantos-org/sdk", async (orig) => ({
  ...(await orig<object>()),
  supportsAllowanceTransfer: () => h.allowanceTransfer,
}));
vi.mock("@/features/assets", () => ({ useInvalidateTransparentBalances: () => async () => {} }));
vi.mock("@/features/chain", async () => (await import("@/test/fakes/chain")).activeChainHooks());
vi.mock("@/features/fees", () => ({
  fetchAssetFeeInputs: async () => {
    h.log.push("fee inputs");
    return { scale: 1n, feeBps: 30n, token: "0xtoken", index: 10n ** 27n };
  },
}));
vi.mock("@/features/ops", () => ({
  useTrackedMutation: (spec: typeof h.spec) => {
    h.spec = spec;
    return {};
  },
}));
vi.mock("@/features/tx", async (orig) => ({
  ...(await orig<object>()),
  preopenDepositStream: () => h.log.push("sse"),
}));
vi.mock("@/features/wallet", () => ({ useWalletInstance: () => ({ chain: {} }) }));
vi.mock("./permit2-approval", () => ({
  needsPermit2Approval: async () => {
    h.log.push("allowance read");
    return h.needsApproval;
  },
  approvePermit2: async () => h.log.push("approve"),
}));

async function run(asEth: boolean) {
  renderHook(() => useDeposit());
  const progress = {
    start: (steps: { id: TxPhase }[]) => h.log.push(`start ${steps.map((s) => s.id).join(",")}`),
    set: (p: TxPhase) => h.log.push(`set ${p}`),
  };
  const actions = {
    deposit: async (req: Record<string, unknown>) => {
      h.log.push(`deposit ${JSON.stringify(Object.keys(req))} asEth=${String(req.asEth)}`);
      return {};
    },
  };
  await h.spec?.run(actions, { amount: 5n, asset: 1n, asEth }, progress);
  return h.log;
}

beforeEach(() => {
  h.log = [];
  h.allowanceTransfer = false;
  h.needsApproval = false;
});

describe("useDeposit", () => {
  it("sends native coin in one payable transaction", async () => {
    expect(await run(true)).toEqual([
      "sse",
      "start submitting,broadcast,mined",
      'deposit ["amount","asset","asEth","onPhase"] asEth=true',
    ]);
  });

  it("pulls within an AllowanceTransfer window without signing", async () => {
    h.allowanceTransfer = true;
    expect(await run(false)).toEqual([
      "sse",
      "fee inputs",
      "start submitting,broadcast,mined",
      'deposit ["amount","asset","onPhase"] asEth=undefined',
    ]);
  });

  it("signs a witness per deposit, approving the token first when it has to", async () => {
    expect(await run(false)).toEqual([
      "sse",
      "fee inputs",
      "allowance read",
      "start signing,submitting,broadcast,mined",
      'deposit ["amount","asset","onPhase"] asEth=undefined',
    ]);

    h.log = [];
    h.needsApproval = true;
    expect(await run(false)).toEqual([
      "sse",
      "fee inputs",
      "allowance read",
      "start approving,signing,submitting,broadcast,mined",
      "set approving",
      "approve",
      'deposit ["amount","asset","onPhase"] asEth=undefined',
    ]);
  });
});
