// EIP-6963 announcement fixtures.
//
// Three test files drive wallet discovery by dispatching the announce event,
// and each had grown its own copy of these — including its own spelling of the
// event name, which is the one string that has to stay in step with
// `features/eip1193/discovery.ts`.

import { vi } from "vitest";
import type { Eip6963ProviderDetail } from "@/features/eip1193/store";

/// An announced wallet. `name` defaults to the rdns, which is all the tests
/// that only care about identity need.
export function detail(uuid: string, rdns: string, name = rdns, icon = ""): Eip6963ProviderDetail {
  return { info: { uuid, name, icon, rdns }, provider: { request: vi.fn() } };
}

/// Fire the announce event a wallet extension would.
export function announce(d: Eip6963ProviderDetail): void {
  window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: d }));
}
