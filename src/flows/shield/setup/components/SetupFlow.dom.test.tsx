import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { fakeWalletApi, fakeWalletContext } from "@/test/fakes/wallet";
import { hexAddress } from "@/test/fixtures/addresses";
import { makeAsset } from "@/test/fixtures/assets";
import { press } from "@/test/interact";
import { ALLOWANCE_EXPIRY_DAYS } from "../permit2-setup";
import { SetupFlow } from "./SetupFlow";

const T0 = Date.UTC(2026, 0, 1);
const HOUR = 3600 * 1000;

const setup = vi.hoisted(() => ({ batch: vi.fn(async (..._args: unknown[]) => {}) }));

vi.mock("@/features/wallet", () => ({
  useWallet: () =>
    fakeWalletContext({ wallet: fakeWalletApi({ setupDepositAllowance: setup.batch }) }),
  useWalletInstance: () => fakeWalletApi({ setupDepositAllowance: setup.batch }),
}));
vi.mock("@/features/chain", async () => ({
  ...(await import("@/test/fakes/chain")).activeChainHooks(() => undefined),
  useTxExplorerUrl: () => () => undefined,
}));
vi.mock("../use-setup-status", () => ({ useInvalidateSetupStatus: () => async () => {} }));

const TOKEN = hexAddress("11");
const assets = [makeAsset(1n, "AAA", { token: TOKEN })];

describe("SetupFlow", () => {
  it("counts the granted window from the press, not from the last render", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(T0);
    render(
      <SetupFlow
        assets={assets}
        willApproveErc20={() => false}
        onSuccess={() => {}}
        onCancel={() => {}}
      />,
    );

    now.mockReturnValue(T0 + HOUR);
    press("begin setup");

    await waitFor(() => expect(setup.batch).toHaveBeenCalledTimes(1));
    const [args] = setup.batch.mock.calls[0] as [{ assets: bigint[]; expiration: number }];
    expect(args.assets).toEqual([1n]);
    expect(args.expiration).toBe(
      Math.floor((T0 + HOUR) / 1000) + ALLOWANCE_EXPIRY_DAYS * 24 * 3600,
    );
  });
});
