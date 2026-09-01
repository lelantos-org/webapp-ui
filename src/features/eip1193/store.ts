// Authoritative wallet state, fed by the active EIP-1193 provider's
// `accountsChanged` / `chainChanged` events. A single provider is latched at
// connect-time (EIP-6963 may discover several); only its `rdns` is persisted,
// and boot resumes silently via `eth_accounts` (no popup).
//
// This module is the state machine and nothing else. The protocol lives beside
// it: `provider.ts` parses the wire and owns the event listeners,
// `switch-chain.ts` drives `wallet_switchEthereumChain`, `rdns-storage.ts`
// holds the two persisted keys, and `discovery.ts` collects the announcements.

import type { ChainEntry } from "@/config/chains";
import { describeError } from "@/shared/lib/errors";
import { createLogger } from "@/shared/lib/logger";
import {
  type Eip6963ProviderDetail,
  type Eip6963ProviderInfo,
  ProviderRegistry,
} from "./discovery";
import { attachProviderEvents, type Eip1193Provider, firstAccount, parseChainId } from "./provider";
import { attachedRdns, forgetAttachedRdns, rememberRdns } from "./rdns-storage";
import { switchWalletChain } from "./switch-chain";

export { preferredRdns } from "./rdns-storage";
export type { Eip1193Provider, Eip6963ProviderDetail, Eip6963ProviderInfo };

const log = createLogger("eip1193");

/// How long to wait for the requested wallet to announce before giving up.
///
/// Extensions announce on their own schedule, so the wait is bounded by time
/// rather than resolved by whichever provider announces first.
const ANNOUNCE_WAIT_MS = 400;

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

/// One wallet's `eth_accounts` / `eth_chainId` pair, or `undefined` when the
/// wallet answered with neither an account nor a usable chain id.
interface Handshake {
  address: `0x${string}`;
  chainId: number;
}

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
      const pick = await this.awaitProvider(rdns);
      if (!pick) {
        this.set({ status: "error", error: this.notFoundMessage(rdns) });
        return;
      }
      // `eth_requestAccounts`, so this is the call that raises the prompt.
      const shake = await this.handshake(pick.provider, "eth_requestAccounts");
      if (!shake) throw new Error("Wallet returned no accounts.");
      this.attach(pick, shake);
      rememberRdns(pick.info.rdns);
      log.info("connected", { rdns: pick.info.rdns, ...shake });
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
    const rdns = attachedRdns();
    if (!rdns) return;
    // Wait for this specific wallet to announce. `pick` does not substitute, so
    // a late announce costs a wait rather than resuming into whichever other
    // wallet announced first.
    const pick = await this.awaitProvider(rdns);
    if (!pick) {
      log.debug("resume: no announced provider matched stored rdns", rdns);
      return;
    }
    try {
      const shake = await this.handshake(pick.provider, "eth_accounts");
      if (!shake) {
        log.debug("resume: wallet has no authorised account or chain; staying idle");
        return;
      }
      // A resume finishing after an explicit connect must not overwrite it:
      // `attach` replaces address and chainId wholesale, and the stored rdns
      // refers to the previous session rather than the one just chosen.
      if (this.connecting || this.state.status === "connected") {
        log.debug("resume: superseded by an explicit connect; discarding");
        return;
      }
      this.attach(pick, shake);
      log.info("resumed", { rdns, ...shake });
    } catch (err) {
      log.warn("resume failed", err);
    }
  };

  /// Move the wallet to `chain`; see `switchWalletChain`.
  switchChain = async (chain: ChainEntry): Promise<void> => {
    const provider = this.state.provider;
    if (!provider) throw new Error("Wallet not connected.");
    return switchWalletChain(provider, chain);
  };

  disconnect = (): void => {
    this.detach?.();
    this.detach = null;
    forgetAttachedRdns();
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

  /// Wait out the announcement window for the requested wallet.
  private awaitProvider(rdns?: string): Promise<Eip6963ProviderDetail | undefined> {
    return this.registry.waitFor(() => this.registry.pick(rdns), ANNOUNCE_WAIT_MS);
  }

  /// Read the account and chain a provider is currently on.
  ///
  /// `undefined` when either is missing, which is the shape both callers want:
  /// a resume treats it as "stay idle", and `connect` turns it into the error it
  /// shows. The account method differs — `eth_requestAccounts` prompts,
  /// `eth_accounts` does not — and is the only difference between the two paths.
  private async handshake(
    provider: Eip1193Provider,
    accountsMethod: "eth_accounts" | "eth_requestAccounts",
  ): Promise<Handshake | undefined> {
    const address = firstAccount(await provider.request({ method: accountsMethod }));
    if (!address) return undefined;
    const chainId = parseChainId(await provider.request({ method: "eth_chainId" }));
    if (chainId === undefined) return undefined;
    return { address, chainId };
  }

  /// Wire the picked provider as the active one and attach its event listeners.
  /// Idempotent: detaches any prior provider's handlers first.
  private attach(detail: Eip6963ProviderDetail, { address, chainId }: Handshake): void {
    this.detach?.();
    this.detach = attachProviderEvents(detail.provider, {
      onAccount: (next) => this.set({ address: next }),
      onChain: (id) => this.set({ chainId: id }),
      onDisconnect: () => this.disconnect(),
    });
    this.set({
      status: "connected",
      provider: detail.provider,
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
}

export const walletStore = new WalletStore();

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
