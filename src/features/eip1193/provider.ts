// The EIP-1193 provider surface the store talks to, and the two pieces of
// protocol handling that are not state: parsing a chain id off the wire, and
// wiring up (and later releasing) a provider's event listeners.
//
// Separated from `store.ts` so the store reads as a state machine. Neither
// function here touches store state.

import { createLogger } from "@/shared/lib/logger";

const log = createLogger("eip1193:provider");

/// Minimal EIP-1193 contract.
export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

/// The optional event half of EIP-1193. Every method is optional because a
/// provider is only required to implement `request`; a wallet without listeners
/// still connects, it just never reports a change.
type EventfulProvider = Eip1193Provider & {
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
};

/// Parse a chain id off an EIP-1193 event or RPC result.
///
/// The spec says `chainChanged` carries a `0x`-prefixed hex string, but some
/// wallets emit bare decimal. Assuming radix 16 would turn `"137"` into `311`
/// and drop the app to `unsupported-chain` with no diagnostic, so the radix is
/// chosen by the prefix.
export function parseChainId(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string") return undefined;
  const t = value.trim();
  if (!t) return undefined;
  const n = /^0x/i.test(t) ? Number.parseInt(t.slice(2), 16) : Number(t);
  return Number.isFinite(n) ? n : undefined;
}

/// Normalise whatever a wallet returns from `eth_accounts` /
/// `eth_requestAccounts` into a lowercased address, or `undefined` when it
/// returned none.
export function firstAccount(accounts: unknown): `0x${string}` | undefined {
  const raw = Array.isArray(accounts) ? accounts[0] : undefined;
  const addr = (raw ?? "").toString().toLowerCase();
  return addr ? (addr as `0x${string}`) : undefined;
}

/// What the store wants to be told about, in the store's own terms rather than
/// EIP-1193's — so the store never destructures an event payload.
export interface ProviderEvents {
  /// The wallet switched to another account.
  onAccount(address: `0x${string}`): void;
  /// The wallet switched networks.
  onChain(chainId: number): void;
  /// The wallet went away: no authorised account, or an explicit `disconnect`.
  onDisconnect(): void;
}

/// Attach `events` to `provider`; returns the detach function.
///
/// Callers must hold the returned function and call it before attaching
/// another provider — the handlers close over the store, so a lost detach is a
/// listener leak that keeps a disconnected wallet driving state.
export function attachProviderEvents(
  provider: Eip1193Provider,
  events: ProviderEvents,
): () => void {
  const onAccountsChanged = (accounts: unknown) => {
    const next = firstAccount(accounts);
    log.debug("accountsChanged", next);
    if (!next) {
      events.onDisconnect();
      return;
    }
    events.onAccount(next);
  };
  const onChainChanged = (raw: unknown) => {
    const id = parseChainId(raw);
    log.debug("chainChanged", id);
    if (id !== undefined) events.onChain(id);
    else log.warn("chainChanged with unparseable id", raw);
  };
  const onDisconnect = () => {
    log.debug("provider emitted disconnect");
    events.onDisconnect();
  };

  const p = provider as EventfulProvider;
  p.on?.("accountsChanged", onAccountsChanged);
  p.on?.("chainChanged", onChainChanged);
  p.on?.("disconnect", onDisconnect);
  return () => {
    p.removeListener?.("accountsChanged", onAccountsChanged);
    p.removeListener?.("chainChanged", onChainChanged);
    p.removeListener?.("disconnect", onDisconnect);
  };
}
