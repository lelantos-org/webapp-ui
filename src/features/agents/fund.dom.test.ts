import { circuitAmount, type SpendPhase, type WalletApi } from "@lelantos-org/sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAgent } from "./fund";
import { agentsSnapshot, resetForTest } from "./store";

vi.mock("@/features/claim-links", () => ({
  deriveEphemeralAddress: async () => "lelantos1agent",
}));

type Transfer = (opts: { onPhase?: (p: SpendPhase) => void }) => Promise<unknown>;

const funder = (transfer: Transfer) => ({ transfer }) as unknown as WalletApi;
const args = { label: "bot", amount: circuitAmount(5n), asset: 1n, chainId: 31337n };

beforeEach(() => {
  localStorage.clear();
  resetForTest();
});

describe("createAgent", () => {
  it("keeps the record of an agent it funded", async () => {
    const result = await createAgent(
      funder(async () => ({ txHash: "0xabc" })),
      args,
    );
    expect(agentsSnapshot().map((a) => a.id)).toEqual([result.recordId]);
  });

  it("drops the record when the transfer failed before reaching the relayer", async () => {
    const transfer: Transfer = async ({ onPhase }) => {
      onPhase?.("preparing");
      onPhase?.("proving");
      throw new Error("proof failed");
    };
    await expect(createAgent(funder(transfer), args)).rejects.toThrow("proof failed");
    expect(agentsSnapshot()).toEqual([]);
  });

  it("keeps the record once the spend was handed to the relayer, as it may still land", async () => {
    const transfer: Transfer = async ({ onPhase }) => {
      onPhase?.("submitting");
      throw new Error("connection reset");
    };
    await expect(createAgent(funder(transfer), args)).rejects.toThrow("connection reset");
    expect(agentsSnapshot()).toHaveLength(1);
  });
});
