// @vitest-environment jsdom
// "Create link" gating and its submit guard.
//
// Two regressions. The button used to be keyed off the blocked *reason* alone,
// and an over-balance amount has none — the field states it — so the button
// went live and the link failed only after a full proof. And the submit had no
// submit-once guard: `handleSubmit` awaits the resolver before the stage moves
// to `running`, so a held Enter created two links.
//
// Everything the form reads is stubbed at the feature boundary; the form, the
// amount parsing and validation, `ActionForm` and the stage machine are real.

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeAsset } from "@/test/fixtures/assets";
import { deferred } from "@/test/harness";
import { routerWrapper } from "@/test/render";
import { GenerateLinkForm } from "./GenerateLinkForm";

const USDC = makeAsset(1n, "USDC", { decimals: 6, token: `0x${"11".repeat(20)}` });

const link = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  balance: 0n,
}));

vi.mock("@/features/assets", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/assets")>()),
  useRegisteredAssets: () => [USDC],
  useAssetBalance: () => ({ balance: link.balance, pending: 0n, outflow: 0n }),
  useBalances: () => ({ isLoading: false }),
  useAssetSelectOptions: () => [{ value: "1", symbol: "USDC", label: "USDC" }],
  usePrices: () => new Map(),
}));
vi.mock("@/features/chain", () => ({
  useChainRegistry: () => [],
  useTxExplorerUrl: () => () => undefined,
}));
vi.mock("@/features/fees", () => ({
  FeeDetails: () => null,
  feeIncoming: () => false,
  feeLegFor: () => "withdraw",
  shownFee: () => undefined,
  useFeePreview: () => ({}),
  useFeePanel: () => ({ block: undefined, pending: false, relayerAmount: 0n }),
}));
vi.mock("@/features/wallet", () => ({
  SyncNotice: () => null,
  useSpendableMax: () => undefined,
  useWalletState: () => ({ error: null }),
  preloadProverWorker: async () => {},
}));
vi.mock("./use-generate-link", () => ({
  useGenerateLink: () => ({
    mutation: {
      mutateAsync: link.mutateAsync,
      isPending: false,
      error: null,
      data: undefined,
      reset: () => {},
    },
    progress: { steps: [], phase: undefined, done: false, reset: () => {} },
  }),
}));
vi.mock("@/features/claim-links", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/claim-links")>()),
  useLinkVault: () => ({
    pressure: { nextEvicted: undefined, ttlMs: 7 * 24 * 3600 * 1000, count: 0, capacity: 50 },
  }),
  EvictionBlock: () => null,
  VaultSummary: () => null,
}));
vi.mock("./components/GenerateModal", () => ({ GenerateModal: () => null }));
vi.mock("./components/ClaimLinkResult", () => ({ ClaimLinkResult: () => null }));

function renderForm() {
  render(<GenerateLinkForm />, { wrapper: routerWrapper });
  const button = screen.getByRole("button", { name: "Create link" });
  return {
    button,
    type: (amount: string) =>
      fireEvent.change(screen.getByLabelText("Amount to send"), { target: { value: amount } }),
    acknowledge: () => fireEvent.click(screen.getByRole("checkbox")),
  };
}

beforeEach(() => {
  link.balance = 5_000_000n;
});

describe("GenerateLinkForm", () => {
  it("goes live on a covered amount once the box is ticked", async () => {
    const { button, type, acknowledge } = renderForm();
    type("2");
    acknowledge();
    await waitFor(() => expect(button).toBeEnabled());
  });

  it("holds Create link on an amount over the balance", async () => {
    const { button, type, acknowledge } = renderForm();
    acknowledge();
    type("2");
    await waitFor(() => expect(button).toBeEnabled());

    type("6");
    await waitFor(() => expect(button).toBeDisabled());
    // The field names the problem; the button adds no second sentence.
    expect(screen.getByText("More than you hold")).toBeInTheDocument();
  });

  it("creates one link for a doubled submit", async () => {
    const pendingLink = deferred<{ url: string; recordId: string }>();
    link.mutateAsync.mockReturnValue(pendingLink.promise);
    const { button, type, acknowledge } = renderForm();
    type("2");
    acknowledge();
    await waitFor(() => expect(button).toBeEnabled());

    const form = button.closest("form");
    if (!form) throw new Error("Create link is not inside a form");
    // Both land before the first has re-rendered anything, as a held Enter does.
    // One `act` around the pair and the wait, so the renders both submits
    // schedule after their resolvers settle are flushed inside it.
    await act(async () => {
      fireEvent.submit(form);
      fireEvent.submit(form);
      // The second submit started in the same tick as the first, so by the time
      // the first reaches `mutateAsync` the second's resolver has settled too —
      // and `waitFor` only re-checks after a macrotask, when both have run.
      await vi.waitFor(() => expect(link.mutateAsync).toHaveBeenCalled());
    });
    expect(link.mutateAsync).toHaveBeenCalledTimes(1);
  });
});
