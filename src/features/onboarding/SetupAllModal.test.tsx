// The multi-token setup modal hands a frozen asset list to `SetupFlow`.
//
// `SetupFlow` invalidates every asset's Permit2 probe when it succeeds, which
// empties `outstanding` — and with it the default selection. A live-derived
// asset list therefore went empty at the moment of success and unmounted the
// flow before its "done" screen could auto-close, leaving the picker on screen
// showing "everything is already set up". These pin the snapshot.

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SetupStatus } from "./use-setup-status";

const TOK_A = `0x${"11".repeat(20)}`;
const TOK_B = `0x${"22".repeat(20)}`;
const FAR = Math.floor(Date.now() / 1000) + 365 * 24 * 3600;

const NOTHING_APPROVED: SetupStatus = {
  erc20Allowance: 0n,
  window: { amount: 0n, expiration: FAR, nonce: 0 },
};
const FULLY_APPROVED: SetupStatus = {
  erc20Allowance: (1n << 160n) - 1n,
  window: { amount: (1n << 160n) - 1n, expiration: FAR, nonce: 1 },
};

// Ids 3 and 4 are the yield variants of 1 and 2: a distinct asset id over the
// same ERC-20. The picker is per token, so they must not double the list.
const assets = [
  { id: 1n, token: TOK_A, symbol: "AAA", decimals: 18, scale: 1n, isWeth: false },
  { id: 2n, token: TOK_B, symbol: "BBB", decimals: 6, scale: 1n, isWeth: false },
  { id: 3n, token: TOK_A, symbol: "AAA", decimals: 18, scale: 1n, isWeth: false },
  { id: 4n, token: TOK_B, symbol: "BBB", decimals: 6, scale: 1n, isWeth: false },
];

const probe = vi.hoisted(() => ({ current: new Map<bigint, SetupStatus>() }));
/// Captures what `SetupFlow` was handed, and exposes its `onSuccess` so a test
/// can drive the real post-success sequence: probes refresh, then the flow's
/// auto-close fires.
const flow = vi.hoisted(() => ({ assets: [] as { symbol: string }[], onSuccess: () => {} }));

vi.mock("@/features/assets", () => ({ useRegisteredAssets: () => assets }));
vi.mock("@/features/wallet", () => ({
  useWallet: () => ({ wallet: { chain: {} } }),
  // `evaluateSetup` (kept real, via importOriginal below) reads this. The
  // value is irrelevant here — every fixture expires a year out — but the
  // export has to exist or the partial mock of the barrel breaks the module.
  SAFETY_BUFFER_SECS: 60,
  // Same reason: `evaluateSetup` derives `willApproveErc20` from the cap the
  // run would grant.
  defaultAllowanceCap: () => (1n << 160n) - 1n,
}));
vi.mock("./use-setup-status", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./use-setup-status")>()),
  useSetupStatusMany: () => ({ statuses: probe.current, isLoading: false, isError: false }),
}));
vi.mock("./SetupFlow", () => ({
  SetupFlow: (p: { assets: { symbol: string }[]; onSuccess: () => void }) => {
    flow.assets = p.assets;
    flow.onSuccess = p.onSuccess;
    return <div data-testid="flow">{p.assets.map((a) => a.symbol).join(",")}</div>;
  },
  setupCostLine: (n: number) => `${n} approvals`,
}));

const { SetupAllModal } = await import("./SetupAllModal");

const allProbes = (status: SetupStatus) => new Map(assets.map((a) => [a.id, status] as const));

function open(onClose = () => {}) {
  probe.current = allProbes(NOTHING_APPROVED);
  const r = render(<SetupAllModal onClose={onClose} />);
  fireEvent.click(screen.getByText("run setup"));
  return r;
}

describe("SetupAllModal", () => {
  it("hands every outstanding token to the flow by default", () => {
    open();
    // Every id behind a picked token, so each one's probe is invalidated on
    // success — deduped to rows by `SetupFlow`, not here.
    expect(screen.getByTestId("flow")).toHaveTextContent("AAA,BBB,AAA,BBB");
  });

  // Listed per id, one token appeared once per yield variant, and each copy
  // authorized the other.
  it("lists one checkbox per token, not per asset id", () => {
    probe.current = allProbes(NOTHING_APPROVED);
    render(<SetupAllModal onClose={() => {}} />);

    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
    expect(screen.getAllByText("AAA")).toHaveLength(1);
  });

  // Both halves of setup are keyed by `(owner, token, spender)`, so the quote is
  // per token too.
  it("quotes one approval per token", () => {
    probe.current = allProbes(NOTHING_APPROVED);
    render(<SetupAllModal onClose={() => {}} />);

    expect(screen.getByText("2 approvals")).toBeInTheDocument();
  });

  it("unticking a token drops every id behind it", () => {
    probe.current = allProbes(NOTHING_APPROVED);
    render(<SetupAllModal onClose={() => {}} />);

    fireEvent.click(screen.getAllByRole("checkbox")[0]!);
    fireEvent.click(screen.getByText("run setup"));

    expect(screen.getByTestId("flow")).toHaveTextContent("BBB,BBB");
  });

  // The regression: success invalidates the probes, so `outstanding` empties.
  it("keeps the flow mounted after the probes report everything approved", () => {
    const { rerender } = open();

    probe.current = allProbes(FULLY_APPROVED);
    rerender(<SetupAllModal onClose={() => {}} />);

    // Live-derived, this went empty and unmounted the flow mid-auto-close.
    expect(screen.getByTestId("flow")).toHaveTextContent("AAA,BBB");
  });

  it("closes once the flow reports success", () => {
    const onClose = vi.fn();
    open(onClose);
    flow.onSuccess();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
