import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deferred } from "@/test/async";
import { idleFeePanel } from "@/test/fakes/fees";
import { fakeActionMutation } from "@/test/fakes/operation";
import { hexAddress } from "@/test/fixtures/addresses";
import { makeAsset } from "@/test/fixtures/assets";
import { fill } from "@/test/interact";
import { routerWrapper } from "@/test/render";
import { GenerateLinkForm } from "./GenerateLinkForm";

const USDC = makeAsset(1n, "USDC", { decimals: 6, token: hexAddress("11") });

const mutateAsync = vi.fn();
let balance = 0n;

vi.mock("@/features/assets", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/assets")>()),
  ...(await import("@/test/fakes/assets")).assetReads(() => ({ assets: [USDC], balance })),
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
  useFeePanel: () => idleFeePanel(),
  withSymbol: (asset: unknown) => asset,
}));
vi.mock("@/features/wallet", async () =>
  (await import("@/test/fakes/wallet")).spendFormWalletHooks(),
);
vi.mock("./use-generate-link", () => ({
  useGenerateLink: () => fakeActionMutation(mutateAsync),
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
vi.mock("./components/LinkResult", () => ({ LinkResult: () => null }));

function renderForm() {
  render(<GenerateLinkForm />, { wrapper: routerWrapper });
  const button = screen.getByRole("button", { name: "Create link" });
  return {
    button,
    type: (amount: string) => fill("Amount to send", amount),
    acknowledge: () => fireEvent.click(screen.getByRole("checkbox")),
  };
}

beforeEach(() => {
  balance = 5_000_000n;
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
    expect(screen.getByText("More than you hold")).toBeInTheDocument();
  });

  it("creates one link for a doubled submit", async () => {
    const pendingLink = deferred<{ url: string; recordId: string }>();
    mutateAsync.mockReturnValue(pendingLink.promise);
    const { button, type, acknowledge } = renderForm();
    type("2");
    acknowledge();
    await waitFor(() => expect(button).toBeEnabled());

    const form = button.closest("form");
    if (!form) throw new Error("Create link is not inside a form");
    // Both submits land before the first re-renders, as a held Enter does.
    await act(async () => {
      fireEvent.submit(form);
      fireEvent.submit(form);
      await vi.waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    });
    expect(mutateAsync).toHaveBeenCalledTimes(1);
  });
});
