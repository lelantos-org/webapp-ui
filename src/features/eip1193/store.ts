// Authoritative wallet state, fed by the active EIP-1193 provider's
// `accountsChanged` / `chainChanged` events. A single provider is latched at
// connect-time (EIP-6963 may discover several); only its `rdns` is persisted,
// and boot resumes silently via `eth_accounts` (no popup).

import type { ChainEntry } from "@/config/chains";
import {
  type Eip6963ProviderDetail,
  type Eip6963ProviderInfo,
  ProviderRegistry,
} from "@/features/eip1193/discovery";
import { createLogger } from "@/shared/lib/logger";
import { localStore } from "@/shared/lib/storage";

export type { Eip6963ProviderDetail, Eip6963ProviderInfo };

/// Minimal EIP-1193 contract.
export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

const log = createLogger("eip1193");

const STORAGE_KEY = "lelantos:wallet:rdns";

/// How long to wait for the wanted wallet to announce before giving up.
///
/// Replaces the fixed sleeps this module used to do. Extensions announce on
/// their own schedule, and the previous 60/120ms sleeps decided the outcome by
/// whoever won that race rather than by what the user picked.
const ANNOUNCE_WAIT_MS = 400;

/// Parse a chain id off an EIP-1193 event or RPC result.
///
/// The spec says `chainChanged` carries a `0x`-prefixed hex string, but wallets
/// in the wild also emit bare decimal. Assuming radix 16 turns `"137"` into
/// `311`, which drops the whole app to `unsupported-chain` with no diagnostic —
/// so branch on the prefix instead.
export function parseChainId(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string") return undefined;
  const t = value.trim();
  if (!t) return undefined;
  const n = /^0x/i.test(t) ? Number.parseInt(t.slice(2), 16) : Number(t);
  return Number.isFinite(n) ? n : undefined;
}

export type ConnectionStatus = "idle" | "connecting" | "connected" | "error";

export interface ConnectionState {
  status: ConnectionStatus;
  provider?: Eip1193Provider;
  rdns?: string;
  name?: string;
  address?: `0x${string}`;
  chainId?: number;
  error?: string;
  /// All EIP-6963 providers seen so far (deduped by uuid).
  discovered: Eip6963ProviderDetail[];
}

const initial: ConnectionState = {
  status: "idle",
  discovered: [],
};

type Listener = () => void;

class WalletStore {
  private state: ConnectionState = initial;
  private listeners = new Set<Listener>();
  /// Detaches the active provider's event handlers; prevents listener leaks
  /// on switch/disconnect.
  private detach: (() => void) | null = null;
  private readonly registry = new ProviderRegistry();
  /// Guards `connect` against re-entry; see the note there.
  private connecting = false;

  constructor() {
    // Mirror announcements into `discovered` so React subscribers see them
    // through the one store they already read.
    this.registry.subscribe(() => this.set({ discovered: this.registry.list() }));
  }

  getState = (): ConnectionState => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(patch: Partial<ConnectionState>): void {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }

  /// Ask wallets to announce themselves. Safe to call repeatedly.
  startDiscovery(): void {
    this.registry.start();
  }

  /// Find an announced provider; see `ProviderRegistry.pick`.
  pickProvider(rdns?: string): Eip6963ProviderDetail | undefined {
    return this.registry.pick(rdns);
  }

  /// Pop the wallet's connect prompt for the given (or default) provider
  /// and latch it as the active one. Persists rdns so reloads stay connected.
  connect = async (rdns?: string): Promise<void> => {
    if (typeof window === "undefined") return;
    // Re-entrancy guard. Without it a double-click issued two
    // `eth_requestAccounts` prompts and two `attach()` calls for one intent.
    if (this.connecting) return;
    this.connecting = true;
    // Set before the announce wait, not after it. The connect button reads
    // `status`, and this used to sit on `idle` for the whole discovery window,
    // rendering as though the click had done nothing.
    this.set({ status: "connecting", error: undefined });
    try {
      if (this.registry.list().length === 0) this.startDiscovery();
      const pick = await this.registry.waitFor(() => this.registry.pick(rdns), ANNOUNCE_WAIT_MS);
      if (!pick) {
        this.set({
          status: "error",
          error: rdns
            ? `${rdns} did not respond. Is it installed and unlocked?`
            : "No wallet detected. Install MetaMask.",
        });
        return;
      }
      const accounts = (await pick.provider.request({
        method: "eth_requestAccounts",
      })) as string[];
      const address = (accounts[0] ?? "").toLowerCase() as `0x${string}`;
      if (!address) throw new Error("Wallet returned no accounts.");
      const chainId = parseChainId(await pick.provider.request({ method: "eth_chainId" }));
      if (chainId === undefined) throw new Error("Wallet returned no chain id.");
      this.attach(pick, address, chainId);
      this.persistRdns(pick.info.rdns);
      log.info("connected", { rdns: pick.info.rdns, address, chainId });
    } catch (err) {
      log.warn("connect failed", err);
      this.set({
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      this.connecting = false;
    }
  };

  /// Silent reconnect on page load via `eth_accounts` (no wallet popup).
  /// Falls closed (status stays `idle`) on any miss.
  resumeFromStorage = async (): Promise<void> => {
    if (typeof window === "undefined") return;
    this.startDiscovery();
    const rdns = localStore.get(STORAGE_KEY);
    if (!rdns) return;
    // Wait for *this* wallet to announce. `pickProvider` no longer substitutes,
    // so a late announce costs a wait rather than silently resuming into
    // whichever other wallet happened to be quicker.
    const pick = await this.registry.waitFor(() => this.registry.pick(rdns), ANNOUNCE_WAIT_MS);
    if (!pick) {
      log.debug("resume: no announced provider matched stored rdns", rdns);
      return;
    }
    try {
      const accounts = (await pick.provider.request({ method: "eth_accounts" })) as string[];
      const address = (accounts[0] ?? "").toLowerCase() as `0x${string}`;
      if (!address) {
        log.debug("resume: wallet has no authorised account; staying idle");
        return;
      }
      const chainId = parseChainId(await pick.provider.request({ method: "eth_chainId" }));
      if (chainId === undefined) {
        log.debug("resume: wallet returned no chain id; staying idle");
        return;
      }
      // A resume that finishes after an explicit connect must not clobber it:
      // `attach` overwrites address and chainId wholesale, and the stored rdns
      // reflects the *previous* session, not the one the user just chose.
      if (this.connecting || this.state.status === "connected") {
        log.debug("resume: superseded by an explicit connect; discarding");
        return;
      }
      this.attach(pick, address, chainId);
      log.info("resumed", { rdns, address, chainId });
    } catch (err) {
      log.warn("resume failed", err);
    }
  };

  /// Drive `wallet_switchEthereumChain`; on 4902 (chain unknown to wallet)
  /// add it via `wallet_addEthereumChain`, then retry the switch. The
  /// `chainChanged` listener updates state when the wallet finishes, so
  /// callers need no further sync.
  ///
  /// Takes the whole `ChainEntry`, not an id: the `wallet_addEthereumChain`
  /// fallback has to describe the chain being added. Reading the name, RPC and
  /// explorer off a build-time singleton instead would register every chain
  /// under whichever one the bundle was built for.
  switchChain = async (chain: ChainEntry): Promise<void> => {
    const provider = this.state.provider;
    if (!provider) {
      throw new Error("Wallet not connected.");
    }
    const hexId = `0x${chain.chainId.toString(16)}`;
    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: hexId }],
      });
    } catch (err) {
      const code = (err as { code?: number | string } | null)?.code;
      if (code === 4902 || String(code) === "4902") {
        await provider.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: hexId,
              chainName: chain.chainName,
              nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
              rpcUrls: [chain.rpcUrl],
              blockExplorerUrls: chain.explorerUrl ? [chain.explorerUrl] : undefined,
            },
          ],
        });
        // Some wallets add without switching — retry explicitly.
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: hexId }],
        });
        return;
      }
      throw err;
    }
  };

  disconnect = (): void => {
    this.detach?.();
    this.detach = null;
    localStore.remove(STORAGE_KEY);
    this.set({
      status: "idle",
      provider: undefined,
      rdns: undefined,
      name: undefined,
      address: undefined,
      chainId: undefined,
      error: undefined,
    });
  };

  /// Wire the picked provider as the active one + attach event listeners.
  /// Idempotent: detaches any prior provider's handlers first.
  private attach(detail: Eip6963ProviderDetail, address: `0x${string}`, chainId: number): void {
    this.detach?.();
    const { provider } = detail;
    const onAccountsChanged = (accounts: unknown) => {
      const next = (Array.isArray(accounts) ? accounts[0] : undefined)?.toString().toLowerCase() as
        | `0x${string}`
        | undefined;
      log.debug("accountsChanged", next);
      if (!next) {
        this.disconnect();
        return;
      }
      this.set({ address: next });
    };
    const onChainChanged = (raw: unknown) => {
      const id = parseChainId(raw);
      log.debug("chainChanged", id);
      if (id !== undefined) this.set({ chainId: id });
      else log.warn("chainChanged with unparseable id", raw);
    };
    const onDisconnect = () => {
      log.debug("provider emitted disconnect");
      this.disconnect();
    };
    const p = provider as Eip1193Provider & {
      on?: (event: string, handler: (...args: unknown[]) => void) => void;
      removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
    };
    p.on?.("accountsChanged", onAccountsChanged);
    p.on?.("chainChanged", onChainChanged);
    p.on?.("disconnect", onDisconnect);
    this.detach = () => {
      p.removeListener?.("accountsChanged", onAccountsChanged);
      p.removeListener?.("chainChanged", onChainChanged);
      p.removeListener?.("disconnect", onDisconnect);
    };
    this.set({
      status: "connected",
      provider,
      rdns: detail.info.rdns,
      name: detail.info.name,
      address,
      chainId,
      error: undefined,
    });
  }

  /// Restore the store to its boot state.
  ///
  /// Exists for tests: this module exports a singleton, so without a reset each
  /// case inherits the previous one's `discovered` list and `seen` map, and the
  /// assertions only hold in file order.
  resetForTest = (): void => {
    this.detach?.();
    this.detach = null;
    this.connecting = false;
    this.registry.reset();
    this.state = { status: "idle", discovered: [] };
    for (const l of this.listeners) l();
  };

  private persistRdns(rdns: string): void {
    localStore.set(STORAGE_KEY, rdns);
  }
}

export const walletStore = new WalletStore();

/// The wallet's current chain, read at call time rather than at render.
///
/// For the last-moment checks before a spend. A component's `useActiveChain()`
/// is a render-time snapshot, and proof generation plus relayer submission take
/// many seconds — long enough for a wallet-initiated `chainChanged` to land in
/// between and put the transaction on a chain the notes do not live on.
///
/// `bigint` because that is what the chain registry and every call site use;
/// the store holds a `number` only because that is what EIP-1193 reports.
export function currentWalletChainId(): bigint | undefined {
  const id = walletStore.getState().chainId;
  return id === undefined ? undefined : BigInt(id);
}
