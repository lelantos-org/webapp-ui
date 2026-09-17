import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WalletCapabilities } from "@/features/wallet";
import { deniedCapabilities, fakeWalletContext } from "@/test/fakes/wallet";
import { routerWrapper } from "@/test/render";
import { DepositForm, depositSchema } from "./DepositForm";

const useDeposit = vi.fn(() => {
  throw new Error("useDeposit must not run behind a closed gate");
});

vi.mock("./use-deposit", () => ({ useDeposit: () => useDeposit() }));

let capabilities: WalletCapabilities;
vi.mock("@/features/wallet", () => ({
  useWallet: () => fakeWalletContext({ capabilities, kind: "passkey" }),
}));

describe("DepositForm", () => {
  it("renders the explanation, and runs none of the deposit hooks", () => {
    capabilities = deniedCapabilities("A passkey holds only your shielded key.");

    render(<DepositForm />, { wrapper: routerWrapper });

    expect(screen.getByText(/deposits unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/passkey holds only your shielded key/i)).toBeInTheDocument();
    expect(useDeposit).not.toHaveBeenCalled();
  });

  it("offers connecting a browser wallet as the remedy", () => {
    capabilities = deniedCapabilities("nope");
    render(<DepositForm />, { wrapper: routerWrapper });
    expect(screen.getByRole("button", { name: /connect a browser wallet/i })).toBeInTheDocument();
  });
});

describe("depositSchema.asEth", () => {
  it('does not treat the string "false" as true', () => {
    // Coercing "false" to true would send real native ETH for an ERC-20 selection.
    expect(depositSchema.safeParse({ amount: "1", asset: "1", asEth: "false" }).success).toBe(
      false,
    );
  });

  it("accepts real booleans and defaults to false", () => {
    expect(depositSchema.parse({ amount: "1", asset: "1", asEth: true }).asEth).toBe(true);
    expect(depositSchema.parse({ amount: "1", asset: "1" }).asEth).toBe(false);
  });
});
