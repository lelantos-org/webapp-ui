// EIP-6963 provider discovery.
//
// Split from the connection store: discovery is a page-lifetime listener over an
// event any wallet extension may fire at any time, while the store tracks the
// single provider that ended up latched. Keeping them apart separates which
// wallets exist from which wallet is in use.

import { createLogger } from "@/shared/lib/logger";

const log = createLogger("eip6963");

export interface Eip6963ProviderInfo {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
}

export interface Eip6963ProviderDetail {
  info: Eip6963ProviderInfo;
  provider: { request(args: { method: string; params?: unknown[] }): Promise<unknown> };
}

/// Wallets announced so far, and the means to wait for one.
export class ProviderRegistry {
  private seen = new Map<string, Eip6963ProviderDetail>();
  private listeners = new Set<() => void>();
  private wired = false;

  /// Ask wallets to announce, wiring the listener on the first call.
  ///
  /// Safe to call repeatedly; boot reaches it from three places. Only the request
  /// event repeats, since registering the handler more than once would turn a
  /// single announce into one notification per prior call.
  start(): void {
    if (typeof window === "undefined") return;
    if (!this.wired) {
      this.wired = true;
      window.addEventListener("eip6963:announceProvider", this.onAnnounce);
    }
    window.dispatchEvent(new Event("eip6963:requestProvider"));
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  list(): Eip6963ProviderDetail[] {
    return Array.from(this.seen.values());
  }

  find(rdns: string): Eip6963ProviderDetail | undefined {
    const wanted = rdns.toLowerCase();
    return this.list().find((d) => d.info.rdns.toLowerCase() === wanted);
  }

  /// Choose a provider.
  ///
  /// With `rdns`, only an exact match; never a substitute. Falling through to the
  /// preference order when the named wallet has not yet announced would attach a
  /// different wallet — a different EOA, and so a different nsk and shielded
  /// address — so this fails closed and leaves the caller to wait or give up.
  ///
  /// Without `rdns`, prefer MetaMask, then whatever announced first. Reached only
  /// when the caller had no wallet to name.
  pick(rdns?: string): Eip6963ProviderDetail | undefined {
    if (rdns) return this.find(rdns);
    const list = this.list();
    return (
      list.find((d) => d.info.rdns === "io.metamask") ??
      list.find((d) => /metamask/i.test(d.info.name)) ??
      list[0]
    );
  }

  /// Resolve as soon as `choose` finds a provider, or after `timeoutMs` with
  /// whatever it returns by then.
  ///
  /// Waits on the announce event rather than sleeping a fixed interval, so an
  /// extension announcing a few ms late is still found.
  waitFor(
    choose: () => Eip6963ProviderDetail | undefined,
    timeoutMs: number,
  ): Promise<Eip6963ProviderDetail | undefined> {
    const immediate = choose();
    if (immediate) return Promise.resolve(immediate);
    return new Promise((resolve) => {
      let settled = false;
      const finish = (found: Eip6963ProviderDetail | undefined) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        unsubscribe();
        resolve(found);
      };
      const timer = setTimeout(() => finish(choose()), timeoutMs);
      const unsubscribe = this.subscribe(() => {
        const found = choose();
        if (found) finish(found);
      });
    });
  }

  /// Forget every announced wallet and unwire the listener.
  ///
  /// For tests: the registry is a singleton, so without this each case inherits
  /// the previous one's announcements and assertions become order-dependent.
  reset(): void {
    this.seen.clear();
    if (this.wired && typeof window !== "undefined") {
      window.removeEventListener("eip6963:announceProvider", this.onAnnounce);
    }
    this.wired = false;
  }

  private onAnnounce = (e: Event): void => {
    const detail = (e as CustomEvent<Eip6963ProviderDetail>).detail;
    if (!detail?.info?.uuid) return;
    if (this.seen.has(detail.info.uuid)) return;
    this.seen.set(detail.info.uuid, detail);
    log.debug("discovered", detail.info.rdns, detail.info.name);
    for (const listener of this.listeners) listener();
  };
}
