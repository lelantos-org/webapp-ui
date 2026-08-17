// EIP-6963 discovery is called from three places on boot (`WalletBoot`,
// `resumeFromStorage`, and `connect` when nothing has been discovered yet).
// These pin the handler registration to one per page: registering per call
// would fan a single announce out into one store notification per prior call,
// re-rendering every `useWalletStore` subscriber that many times.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { type Eip6963ProviderDetail, walletStore } from "./store";

function detail(uuid: string, rdns: string): Eip6963ProviderDetail {
  return {
    info: { uuid, name: rdns, icon: "", rdns },
    provider: { request: vi.fn() },
  };
}

function announce(d: Eip6963ProviderDetail): void {
  window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: d }));
}

describe("startDiscovery", () => {
  let notifies: number;
  let unsubscribe: () => void;

  beforeEach(() => {
    notifies = 0;
    unsubscribe?.();
    unsubscribe = walletStore.subscribe(() => {
      notifies++;
    });
    return () => unsubscribe();
  });

  it("notifies once per announce however many times it was called", () => {
    walletStore.startDiscovery();
    walletStore.startDiscovery();
    walletStore.startDiscovery();

    announce(detail("uuid-a", "io.metamask"));

    expect(notifies).toBe(1);
    expect(walletStore.getState().discovered).toHaveLength(1);
  });

  it("still merges providers announced after the first call", () => {
    walletStore.startDiscovery();
    announce(detail("uuid-b", "com.rainbow"));
    walletStore.startDiscovery();
    announce(detail("uuid-c", "app.phantom"));

    const rdns = walletStore.getState().discovered.map((d) => d.info.rdns);
    expect(rdns).toContain("com.rainbow");
    expect(rdns).toContain("app.phantom");
  });

  it("ignores a repeat announce of a uuid it already has", () => {
    walletStore.startDiscovery();
    const d = detail("uuid-d", "io.zerion");
    announce(d);
    const after = notifies;
    announce(d);
    expect(notifies).toBe(after);
  });
});
