import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { stepsFor } from "@/features/tx";
import { idleProgress } from "@/test/fakes/operation";
import { makeAsset } from "@/test/fixtures/assets";
import { makeChain } from "@/test/fixtures/chains";
import { press } from "@/test/interact";
import { routerWrapper } from "@/test/render";
import { ClaimPage } from "./ClaimPage";
import type { ClaimFlow } from "./use-claim-flow";

const USDC = makeAsset(1n, "USDC", { decimals: 6 });
const CHAIN = makeChain({ chainId: 31337n, tokens: [USDC] });
const ready = {
  kind: "ready",
  nskHex: "x",
  chainId: 31337n,
  eph: {},
  balances: [{ asset: 1n, amount: 250_000_000n, notes: 1 }],
} as unknown as ClaimFlow["phase"];

const flow = vi.hoisted(() => ({ value: undefined as unknown }));
const connect = vi.fn();

vi.mock("./use-claim-flow", () => ({ useClaimFlow: () => flow.value }));
vi.mock("@/features/wallet", () => ({
  useWallet: () => ({ wallet: undefined, status: "disconnected", connect }),
  isConnectionPending: () => false,
}));
vi.mock("@/features/chain", () => ({
  useActiveChainOrUndefined: () => undefined,
  useTxExplorerUrl: () => () => undefined,
}));

function show(over: Partial<ClaimFlow>) {
  flow.value = {
    phase: ready,
    linkChain: CHAIN,
    mismatch: undefined,
    connected: false,
    progress: idleProgress(),
    claim: vi.fn(),
    rescan: vi.fn(),
    claimRest: vi.fn(),
    retry: vi.fn(),
    ...over,
  } satisfies ClaimFlow;
  render(<ClaimPage />, { wrapper: routerWrapper });
  return flow.value as ClaimFlow;
}

beforeEach(() => vi.clearAllMocks());

describe("ClaimPage", () => {
  it("shows the amount before asking for a wallet, and asks for one to claim", () => {
    show({});
    expect(screen.getByText("250 USDC")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Claim/ })).not.toBeInTheDocument();

    press("Connect wallet");
    expect(connect).toHaveBeenCalledOnce();
  });

  it("offers the claim once a wallet is connected", () => {
    const f = show({ connected: true });
    expect(screen.queryByRole("button", { name: "Connect wallet" })).not.toBeInTheDocument();

    press("Claim 250 USDC");
    expect(f.claim).toHaveBeenCalledWith(1n);
  });

  it("offers another look at a link that holds nothing, without asking for a wallet", () => {
    const f = show({ phase: { ...ready, balances: [] } as ClaimFlow["phase"] });
    expect(screen.queryByRole("button", { name: "Connect wallet" })).not.toBeInTheDocument();

    press("Check again");
    expect(f.rescan).toHaveBeenCalledOnce();
  });

  it("shows the claim's steps while it is in flight", () => {
    show({
      connected: true,
      phase: { ...ready, kind: "sweeping", asset: 1n, amount: 250_000_000n } as ClaimFlow["phase"],
      progress: { ...idleProgress(), steps: stepsFor("transfer"), phase: "proving" },
    });
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    expect(screen.getByText(/250 USDC/)).toBeInTheDocument();
  });
});
