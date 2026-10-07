import { type Mock, onTestFinished, vi } from "vitest";
import type { Eip6963ProviderDetail } from "@/features/wallet-kinds";

/// An announced wallet; `name` defaults to the rdns.
export function detail(uuid: string, rdns: string, name = rdns, icon = ""): Eip6963ProviderDetail {
  return { info: { uuid, name, icon, rdns }, provider: { request: vi.fn() } };
}

export function announce(d: Eip6963ProviderDetail): void {
  window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: d }));
}

type ProviderRequest = Eip6963ProviderDetail["provider"]["request"];

export interface InjectedWallet extends Eip6963ProviderDetail {
  /// `request` records what the page asked the extension.
  provider: Eip6963ProviderDetail["provider"] & { request: Mock<ProviderRequest> };
  /// Fire a provider event, as the extension does on an account or network switch.
  emit(event: "accountsChanged" | "chainChanged" | "disconnect", payload?: unknown): void;
}

/// A wallet extension on `chainId` that has authorised `account`. It announces itself whenever
/// the page asks, until the test ends.
export function installWallet(
  account: `0x${string}`,
  chainId: number,
  rdns = "io.metamask",
  name = "MetaMask",
): InjectedWallet {
  const handlers = new Map<string, Set<(payload: unknown) => void>>();
  const provider = {
    request: vi.fn<ProviderRequest>(async ({ method }) => {
      if (method === "eth_accounts" || method === "eth_requestAccounts") return [account];
      if (method === "eth_chainId") return `0x${chainId.toString(16)}`;
      return undefined;
    }),
    on(event: string, handler: (payload: unknown) => void) {
      const set = handlers.get(event) ?? new Set();
      handlers.set(event, set.add(handler));
    },
    removeListener(event: string, handler: (payload: unknown) => void) {
      handlers.get(event)?.delete(handler);
    },
  };
  const wallet: InjectedWallet = {
    info: { uuid: `uuid-${rdns}`, name, icon: "", rdns },
    provider,
    emit(event, payload) {
      for (const handler of handlers.get(event) ?? []) handler(payload);
    },
  };

  const onRequest = () => announce(wallet);
  window.addEventListener("eip6963:requestProvider", onRequest);
  onTestFinished(() => window.removeEventListener("eip6963:requestProvider", onRequest));
  return wallet;
}
