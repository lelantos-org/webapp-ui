import { vi } from "vitest";
import type { Eip6963ProviderDetail } from "@/features/wallet-kinds";

/// An announced wallet; `name` defaults to the rdns.
export function detail(uuid: string, rdns: string, name = rdns, icon = ""): Eip6963ProviderDetail {
  return { info: { uuid, name, icon, rdns }, provider: { request: vi.fn() } };
}

/// Fire the announce event a wallet extension would.
export function announce(d: Eip6963ProviderDetail): void {
  window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: d }));
}
