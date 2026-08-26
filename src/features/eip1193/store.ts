// Authoritative wallet state, fed by the active EIP-1193 provider's
// `accountsChanged` / `chainChanged` events. A single provider is latched at
// connect-time (EIP-6963 may discover several); only its `rdns` is persisted,
// and boot resumes silently via `eth_accounts` (no popup).

import type { ChainEntry } from "@/config/chains";
import { describeError } from "@/shared/lib/errors";
import { createLogger } from "@/shared/lib/logger";
import { localStore } from "@/shared/lib/storage";
import {
  type Eip6963ProviderDetail,
  type Eip6963ProviderInfo,
  ProviderRegistry,
} from "./discovery";
import { isUnrecognizedChain } from "./errors";

export type { Eip6963ProviderDetail, Eip6963ProviderInfo };

/// Minimal EIP-1193 contract.
export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

const log = createLogger("eip1193");

/// The wallet currently attached. Cleared on disconnect, so a resume never
/// reattaches something the user explicitly walked away from.
const STORAGE_KEY = "lelantos:wallet:rdns";

/// The wallet last chosen, kept across disconnects.
///
/// A separate key, since the two have opposite lifetimes: `STORAGE_KEY` is a
/// session latch that `disconnect` clears, while this is a preference that must
/// outlive a session so the picker can order by it on the connect following a
/// disconnect.
const PREFERRED_KEY = "lelantos:wallet:preferred-rdns";

/// How long to wait for the requested wallet to announce before giving up.
///
/// Extensions announce on their own schedule, so the wait is bounded by time
/// rather than resolved by whichever provider announces first.
const ANNOUNCE_WAIT_MS = 400;

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
  /// Detaches the active provider's event handlers, preventing listener leaks on
  /// switch and disconnect.
  private detach: (() => void) | null = null;
  private readonly registry = new ProviderRegistry();
  /// Guards `connect` against re-entry.
  private connecting = false;

  constructor() {
    // Mirror announcements into `discovered` so React subscribers observe them
    // through the store they already read.
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

  /// Raise the wallet's connect prompt for the given (or default) provider and
  /// latch it as the active one. Persists `rdns` so reloads stay connected.
  connect = async (rdns?: string): Promise<void> => {
    if (typeof window === "undefined") return;
    // Re-entrancy guard: without it a double-click issues two
    // `eth_requestAccounts` prompts and two `attach()` calls for one intent.
    if (this.connecting) return;
    this.connecting = true;
    // Set before the announce wait rather than after: the connect button reads
    // `status`, and staying on `idle` for the discovery window would render as
    // though the click had no effect.
    this.set({ status: "connecting", error: undefined });
    try {
      if (this.registry.list().length === 0) this.startDiscovery();
      const pick = await this.registry.waitFor(() => this.registry.pick(rdns), ANNOUNCE_WAIT_MS);
      if (!pick) {
        this.set({ status: "error", error: this.notFoundMessage(rdns) });
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
        error: describeError(err),
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
    // Wait for this specific wallet to announce. `pickProvider` does not
    // substitute, so a late announce costs a wait rather than resuming into
    // whichever other wallet announced first.
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
      // A resume finishing after an explicit connect must not overwrite it:
      // `attach` replaces address and chainId wholesale, and the stored rdns
      // refers to the previous session rather than the one just chosen.
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
  /// Takes the whole `ChainEntry` rather than an id, because the
  /// `wallet_addEthereumChain` fallback must describe the chain being added.
  /// Sourcing the name, RPC and explorer from a build-time singleton would
  /// register every chain under a single configuration.
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
      if (!isUnrecognizedChain(err)) throw err;
      // `warn` rather than `debug`: `debug` requires VITE_DEBUG or `?debug=1`,
      // so a user-reported failure would arrive with the fallback invisible.
      const target = { chainId: hexId, chainName: chain.chainName, rpcUrl: chain.rpcUrl };
      log.warn("chain unknown to the wallet; adding it", target);
      try {
        await provider.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: hexId,
              chainName: chain.chainName,
              nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
              rpcUrls: [chain.rpcUrl],
              // Spread rather than an explicit `undefined`: wallets validate
              // this field's type whenever the key is present, and some reject
              // the whole request over it.
              ...(chain.explorerUrl ? { blockExplorerUrls: [chain.explorerUrl] } : {}),
            },
          ],
        });
      } catch (addErr) {
        // The likely faults are indistinguishable from the message alone: the
        // wallet refusing custom networks, an RPC URL unreachable from the
        // browser, or an RPC answering with a different chain id.
        log.warn("add chain failed", target, addErr);
        throw addErr;
      }
      // Some wallets add without switching, so retry the switch explicitly.
      try {
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: hexId }],
        });
      } catch (switchErr) {
        log.warn("switch after add failed", target, switchErr);
        throw switchErr;
      }
      return;
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

  /// Wire the picked provider as the active one and attach its event listeners.
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
  /// Exists for tests. This module exports a singleton, so without a reset each
  /// case inherits the previous one's `discovered` list and `seen` map, making
  /// assertions order-dependent.
  resetForTest = (): void => {
    this.detach?.();
    this.detach = null;
    this.connecting = false;
    this.registry.reset();
    this.state = { status: "idle", discovered: [] };
    for (const l of this.listeners) l();
  };

  /// Name the wallet as it appeared in the picker. `rdns` is an implementation
  /// detail, and this string is rendered verbatim by `Welcome`.
  private notFoundMessage(rdns?: string): string {
    if (!rdns) {
      return "No EVM wallet detected. Install MetaMask, Rabby or another browser wallet.";
    }
    const known = this.registry.find(rdns);
    return `${known?.info.name ?? rdns} did not respond. Is it installed and unlocked?`;
  }

  private persistRdns(rdns: string): void {
    localStore.set(STORAGE_KEY, rdns);
    localStore.set(PREFERRED_KEY, rdns);
  }
}

export const walletStore = new WalletStore();

/// The wallet chosen last time, if any. Survives a disconnect.
///
/// Used to order the picker. The storage keys stay private to this module.
export function preferredRdns(): string | undefined {
  return localStore.get(PREFERRED_KEY);
}

/// The wallet's current chain, read at call time rather than at render.
///
/// For last-moment checks before a spend. `useActiveChain()` is a render-time
/// snapshot, while proof generation and relayer submission take seconds — long
/// enough for a wallet-initiated `chainChanged` to land in between and place the
/// transaction on a chain the notes do not live on.
///
/// Returns `bigint`, matching the chain registry and call sites; the store holds
/// a `number` because that is what EIP-1193 reports.
export function currentWalletChainId(): bigint | undefined {
  const id = walletStore.getState().chainId;
  return id === undefined ? undefined : BigInt(id);
}
