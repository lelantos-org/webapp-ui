// @vitest-environment jsdom
// When the Permit2 window a setup run grants is counted from.
//
// The expiry used to be read at render, and `run` closed over it. An intro left
// open granted a window counted from whenever it last re-rendered rather than
// from the press — and, since the value moves every second, `run`'s memoised
// identity was never stable. It is now read when the run starts.

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { fakeWalletApi, fakeWalletContext } from "@/test/fakes/wallet";
import { makeAsset } from "@/test/fixtures/assets";
import { ALLOWANCE_EXPIRY_DAYS } from "./permit2-setup";
import { SetupFlow } from "./SetupFlow";

const T0 = Date.UTC(2026, 0, 1);
const HOUR = 3600 * 1000;

const setup = vi.hoisted(() => ({ batch: vi.fn(async (..._args: unknown[]) => {}) }));

// Only the chain write is replaced; the expiry rule is the real one, so the
// test reads the clock the way the run does.
vi.mock("./permit2-setup", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./permit2-setup")>()),
  ensurePermit2AuthorizedSetupBatch: setup.batch,
}));
vi.mock("@/features/wallet", () => ({
  useWallet: () => fakeWalletContext({ wallet: fakeWalletApi() }),
  useWalletInstance: () => fakeWalletApi(),
}));
vi.mock("@/features/chain", async () => ({
  ...(await import("@/test/fakes/chain")).activeChainHooks(() => undefined),
  useTxExplorerUrl: () => () => undefined,
}));
vi.mock("./use-setup-status", () => ({ useInvalidateSetupStatus: () => async () => {} }));

const TOKEN = `0x${"11".repeat(20)}`;
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

    // The intro sits open for an hour with nothing re-rendering it.
    now.mockReturnValue(T0 + HOUR);
    fireEvent.click(screen.getByRole("button", { name: "begin setup" }));

    await waitFor(() => expect(setup.batch).toHaveBeenCalledTimes(1));
    const [, grants] = setup.batch.mock.calls[0] as [unknown, { expirationUnixSecs: number }[]];
    expect(grants[0]?.expirationUnixSecs).toBe(
      Math.floor((T0 + HOUR) / 1000) + ALLOWANCE_EXPIRY_DAYS * 24 * 3600,
    );
  });
});
