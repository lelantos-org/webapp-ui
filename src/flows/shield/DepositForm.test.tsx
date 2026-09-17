// @vitest-environment jsdom
// The capability gate in front of the deposit form.
//
// The point is not only that a panel appears: it is that nothing behind the
// gate runs. `useDeposit` and `useDepositSetup` reach
// `wallet.chain.payerAddress()` transitively, which a passkey wallet's chain
// layer does not have, so a gate placed after them would throw instead of
// explaining.

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WalletCapabilities } from "@/features/wallet";
import { fakeWalletContext } from "@/test/fakes/wallet";
import { routerWrapper } from "@/test/render";
import { DepositForm, depositSchema } from "./DepositForm";

const useDeposit = vi.fn(() => {
  throw new Error("useDeposit must not run behind a closed gate");
});

vi.mock("./use-deposit", () => ({ useDeposit: () => useDeposit() }));

let capabilities: WalletCapabilities;
const connect = vi.fn();
vi.mock("@/features/wallet", () => ({
  useWallet: () => fakeWalletContext({ capabilities, connect, kind: "passkey" }),
}));

const denied = (reason: string): WalletCapabilities => ({
  deposit: { allowed: false, reason },
  depositEth: { allowed: false, reason },
  govern: { allowed: false, reason },
});

describe("DepositForm", () => {
  it("renders the explanation, and runs none of the deposit hooks", () => {
    capabilities = denied("A passkey holds only your shielded key.");

    render(<DepositForm />, { wrapper: routerWrapper });

    expect(screen.getByText(/deposits unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/passkey holds only your shielded key/i)).toBeInTheDocument();
    expect(useDeposit).not.toHaveBeenCalled();
  });

  it("offers connecting a browser wallet as the remedy", () => {
    capabilities = denied("nope");
    render(<DepositForm />, { wrapper: routerWrapper });
    expect(screen.getByRole("button", { name: /connect a browser wallet/i })).toBeInTheDocument();
  });
});

describe("asEth", () => {
  it('does not treat the string "false" as true', () => {
    // `z.coerce.boolean()` is `Boolean(x)`, so every non-empty string — "false"
    // included — coerced to `true`. The field is bound to a hidden input, and
    // the failure mode is a native-ETH deposit for an ERC-20 selection: the
    // user sends real ETH.
    expect(depositSchema.safeParse({ amount: "1", asset: "1", asEth: "false" }).success).toBe(
      false,
    );
  });

  it("accepts real booleans and defaults to false", () => {
    expect(depositSchema.parse({ amount: "1", asset: "1", asEth: true }).asEth).toBe(true);
    expect(depositSchema.parse({ amount: "1", asset: "1" }).asEth).toBe(false);
  });
});
