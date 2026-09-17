import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeWalletApi, fakeWalletContext } from "@/test/fakes/wallet";
import { hexAddress } from "@/test/fixtures/addresses";
import { makeAsset } from "@/test/fixtures/assets";
import { evaluateSetup, type SetupNeeds } from "../evaluate-setup";
import type { Permit2AllowanceState } from "../permit2-setup";

const TOK_A = hexAddress("11");
const TOK_B = hexAddress("22");
const NOW = Date.UTC(2026, 0, 1);
const FAR = Math.floor(NOW / 1000) + 365 * 24 * 3600;

const NOTHING_APPROVED: Permit2AllowanceState = {
  erc20Allowance: 0n,
  window: { amount: 0n, expiration: FAR, nonce: 0 },
};
const FULLY_APPROVED: Permit2AllowanceState = {
  erc20Allowance: (1n << 160n) - 1n,
  window: { amount: (1n << 160n) - 1n, expiration: FAR, nonce: 1 },
};

const assets = [
  makeAsset(1n, "AAA", { token: TOK_A }),
  makeAsset(2n, "BBB", { token: TOK_B, decimals: 6 }),
  makeAsset(3n, "AAA", { token: TOK_A }),
  makeAsset(4n, "BBB", { token: TOK_B, decimals: 6 }),
];

const probe = vi.hoisted(() => ({ current: new Map<string, SetupNeeds>() }));
const flow = vi.hoisted(() => ({ assets: [] as { symbol: string }[], onSuccess: () => {} }));

vi.mock("@/features/assets", () => ({ useRegisteredAssets: () => assets }));
vi.mock("@/features/wallet", () => ({
  useWallet: () => fakeWalletContext({ wallet: fakeWalletApi({ chain: {} }) }),
  useWalletInstance: () => fakeWalletApi({ chain: {} }),
}));
vi.mock("../use-setup-status", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../use-setup-status")>()),
  useSetupNeedsByToken: () => ({ needs: probe.current, isLoading: false, isError: false }),
}));
vi.mock("./SetupFlow", () => ({
  SetupFlow: (p: { assets: { symbol: string }[]; onSuccess: () => void }) => {
    flow.assets = p.assets;
    flow.onSuccess = p.onSuccess;
    return <div data-testid="flow">{p.assets.map((a) => a.symbol).join(",")}</div>;
  },
}));
vi.mock("../setup-copy", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../setup-copy")>()),
  setupCostLine: (n: number) => `${n} approvals`,
}));

const { SetupAllModal } = await import("./SetupAllModal");

const allProbes = (status: Permit2AllowanceState) =>
  new Map(
    [TOK_A, TOK_B].map((t) => [t.toLowerCase(), evaluateSetup(status, undefined, NOW / 1000)]),
  );

function open(onClose = () => {}) {
  probe.current = allProbes(NOTHING_APPROVED);
  const r = render(<SetupAllModal onClose={onClose} />);
  fireEvent.click(screen.getByText("run setup"));
  return r;
}

describe("SetupAllModal", () => {
  beforeEach(() => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
  });

  it("hands every outstanding token to the flow by default, once each", () => {
    open();
    expect(screen.getByTestId("flow")).toHaveTextContent(/^AAA,BBB$/);
  });

  it("lists one checkbox per token, not per asset id", () => {
    probe.current = allProbes(NOTHING_APPROVED);
    render(<SetupAllModal onClose={() => {}} />);

    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
    expect(screen.getAllByText("AAA")).toHaveLength(1);
  });

  it("quotes one approval per token", () => {
    probe.current = allProbes(NOTHING_APPROVED);
    render(<SetupAllModal onClose={() => {}} />);

    expect(screen.getByText("2 approvals")).toBeInTheDocument();
  });

  it("unticking a token drops it from the run", () => {
    probe.current = allProbes(NOTHING_APPROVED);
    render(<SetupAllModal onClose={() => {}} />);

    fireEvent.click(screen.getAllByRole("checkbox")[0]!);
    fireEvent.click(screen.getByText("run setup"));

    expect(screen.getByTestId("flow")).toHaveTextContent(/^BBB$/);
  });

  it("keeps the flow mounted after the probes report everything approved", () => {
    const { rerender } = open();

    probe.current = allProbes(FULLY_APPROVED);
    rerender(<SetupAllModal onClose={() => {}} />);

    expect(screen.getByTestId("flow")).toHaveTextContent("AAA,BBB");
  });

  it("closes once the flow reports success", () => {
    const onClose = vi.fn();
    open(onClose);
    flow.onSuccess();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
