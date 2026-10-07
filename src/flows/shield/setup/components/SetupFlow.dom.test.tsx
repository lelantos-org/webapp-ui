import { waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { fakeWalletApi } from "@/features/wallet/testing";
import { renderApp } from "@/test/app";
import { hexAddress } from "@/test/fixtures/addresses";
import { makeAsset } from "@/test/fixtures/assets";
import { press } from "@/test/interact";
import { ALLOWANCE_EXPIRY_DAYS } from "../permit2-setup";
import { SetupFlow } from "./SetupFlow";

const T0 = Date.UTC(2026, 0, 1);
const HOUR = 3600 * 1000;

const setup = { batch: vi.fn(async (..._args: unknown[]) => {}) };

vi.mock("../use-setup-status", () => ({ useInvalidateSetupStatus: () => async () => {} }));

const TOKEN = hexAddress("11");
const assets = [makeAsset(1n, "AAA", { token: TOKEN })];

describe("SetupFlow", () => {
  it("counts the granted window from the press, not from the last render", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(T0);
    renderApp(
      <SetupFlow
        assets={assets}
        willApproveErc20={() => false}
        onSuccess={() => {}}
        onCancel={() => {}}
      />,
      {
        chain: null,
        wallet: { wallet: fakeWalletApi({ setupDepositAllowance: setup.batch }) },
      },
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
