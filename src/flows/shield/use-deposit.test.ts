// @vitest-environment jsdom
// The three paths a shield takes, each with its own stepper and wallet prompts:
// native coin, an AllowanceTransfer window, and the per-deposit Permit2 witness.
// Which one is the SDK's `quoteDeposit` to say.

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TxPhase } from "@/features/tx";
import { useDeposit } from "./use-deposit";

const h = vi.hoisted(() => ({
  spec: undefined as
    | undefined
    | { run(actions: unknown, input: unknown, progress: unknown): Promise<unknown> },
  strategy: "witness" as "native" | "allowance" | "witness",
  /// Tokens whose ERC-20 → Permit2 allowance falls short.
  short: [] as string[],
  pulls: [{ token: "0xtoken", amount: 5n }],
  log: [] as string[],
}));

vi.mock("@/features/assets", () => ({ useInvalidateTransparentBalances: () => async () => {} }));
vi.mock("@/features/ops", () => ({
  useTrackedMutation: (spec: typeof h.spec) => {
    h.spec = spec;
    return {};
  },
}));
vi.mock("@/features/wallet", () => ({
  useWalletInstance: () => ({
    quoteDeposit: async (call: Record<string, unknown>) => {
      h.log.push(`quote ${JSON.stringify(Object.keys(call))}`);
      return { strategy: h.strategy, pulls: h.pulls };
    },
  }),
}));
vi.mock("./setup/permit2-approval", () => ({
  needsPermit2Approval: async (_w: unknown, pull: { token: string; amount: bigint }) => {
    h.log.push(`allowance read ${pull.token} ${pull.amount}`);
    return h.short.includes(pull.token);
  },
  approvePermit2: async (_w: unknown, token: string) => h.log.push(`approve ${token}`),
}));

async function run(native: boolean, feeAsset?: bigint) {
  renderHook(() => useDeposit());
  const progress = {
    start: (steps: { id: TxPhase }[]) => h.log.push(`start ${steps.map((s) => s.id).join(",")}`),
    set: (p: TxPhase) => h.log.push(`set ${p}`),
  };
  const actions = {
    deposit: async (req: Record<string, unknown>) => {
      h.log.push(`deposit ${JSON.stringify(Object.keys(req))} native=${String(req.native)}`);
      return {};
    },
  };
  await h.spec?.run(actions, { amount: 5n, asset: 1n, native, feeAsset }, progress);
  return h.log;
}

beforeEach(() => {
  h.log = [];
  h.strategy = "witness";
  h.short = [];
  h.pulls = [{ token: "0xtoken", amount: 5n }];
});

describe("useDeposit", () => {
  it("sends native coin in one payable transaction", async () => {
    h.strategy = "native";
    expect(await run(true)).toEqual([
      'quote ["amount","asset","native"]',
      "start submitting,broadcast,mined",
      'deposit ["amount","asset","native","onPhase"] native=true',
    ]);
  });

  it("pulls within an AllowanceTransfer window without signing", async () => {
    h.strategy = "allowance";
    expect(await run(false)).toEqual([
      'quote ["amount","asset","native"]',
      "start submitting,broadcast,mined",
      'deposit ["amount","asset","native","onPhase"] native=false',
    ]);
  });

  it("signs a witness per deposit, approving the token first when it has to", async () => {
    expect(await run(false)).toEqual([
      'quote ["amount","asset","native"]',
      "allowance read 0xtoken 5",
      "start signing,submitting,broadcast,mined",
      'deposit ["amount","asset","native","onPhase"] native=false',
    ]);

    h.log = [];
    h.short = ["0xtoken"];
    expect(await run(false)).toEqual([
      'quote ["amount","asset","native"]',
      "allowance read 0xtoken 5",
      "start approving,signing,submitting,broadcast,mined",
      "set approving",
      "approve 0xtoken",
      'deposit ["amount","asset","native","onPhase"] native=false',
    ]);
  });

  // The relayer fee used to be left out of the allowance check, so an allowance
  // covering the principal alone skipped the approval and the pull reverted.
  it("checks and approves every token the deposit pulls, relayer fee included", async () => {
    h.pulls = [
      { token: "0xtoken", amount: 5n },
      { token: "0xfee", amount: 3n },
    ];
    h.short = ["0xfee"];
    expect(await run(false, 9n)).toEqual([
      'quote ["amount","asset","native","feeAsset"]',
      "allowance read 0xtoken 5",
      "allowance read 0xfee 3",
      "start approving,signing,submitting,broadcast,mined",
      "set approving",
      "approve 0xfee",
      'deposit ["amount","asset","native","feeAsset","onPhase"] native=false',
    ]);
  });

  it("never passes a fee asset on the native path", async () => {
    h.strategy = "native";
    expect(await run(true, 9n)).toContain(
      'deposit ["amount","asset","native","onPhase"] native=true',
    );
  });
});
