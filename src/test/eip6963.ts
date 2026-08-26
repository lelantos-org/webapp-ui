// EIP-6963 announcement fixtures.
//
// Several test files drive wallet discovery by dispatching the announce event.
// Sharing the fixtures keeps one spelling of the event name, which must stay in
// step with `features/eip1193/discovery.ts`.

import { vi } from "vitest";
import type { Eip6963ProviderDetail } from "@/features/eip1193";

/// An announced wallet. `name` defaults to the rdns, which suffices for tests
/// that only assert on identity.
export function detail(uuid: string, rdns: string, name = rdns, icon = ""): Eip6963ProviderDetail {
  return { info: { uuid, name, icon, rdns }, provider: { request: vi.fn() } };
}

/// Fire the announce event a wallet extension would.
export function announce(d: Eip6963ProviderDetail): void {
  window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: d }));
}
