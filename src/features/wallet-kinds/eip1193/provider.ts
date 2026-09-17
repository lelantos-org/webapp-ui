import { createLogger } from "@/shared/lib/logger";

const log = createLogger("eip1193:provider");

/// Minimal EIP-1193 contract.
export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

type EventfulProvider = Eip1193Provider & {
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
};

/// Parse a chain id: hex when `0x`-prefixed, else decimal (some wallets emit decimal).
export function parseChainId(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string") return undefined;
  const t = value.trim();
  if (!t) return undefined;
  const n = /^0x/i.test(t) ? Number.parseInt(t.slice(2), 16) : Number(t);
  return Number.isFinite(n) ? n : undefined;
}

/// The first account from `eth_accounts` / `eth_requestAccounts`, lowercased.
export function firstAccount(accounts: unknown): `0x${string}` | undefined {
  const raw = Array.isArray(accounts) ? accounts[0] : undefined;
  const addr = (raw ?? "").toString().toLowerCase();
  return addr ? (addr as `0x${string}`) : undefined;
}

/// Provider events, in the store's terms.
export interface ProviderEvents {
  /// The wallet switched to another account.
  onAccount(address: `0x${string}`): void;
  /// The wallet switched networks.
  onChain(chainId: number): void;
  /// The wallet went away: no authorised account, or an explicit `disconnect`.
  onDisconnect(): void;
}

/// Attach `events` to `provider`. Call the returned detach before attaching another, or listeners leak.
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
