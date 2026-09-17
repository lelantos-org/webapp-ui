import type { ChainEntry } from "@/config/chains";
import { userMessage } from "@/shared/lib/errors";
import { createStore } from "@/shared/lib/external-store";
import { createLogger } from "@/shared/lib/logger";
import type { ConnectionStatus } from "../types";
import { type Eip6963ProviderDetail, ProviderRegistry } from "./discovery";
import { attachProviderEvents, type Eip1193Provider, firstAccount, parseChainId } from "./provider";
import { attachedRdns, forgetAttachedRdns, rememberRdns } from "./rdns-storage";
import { switchWalletChain } from "./switch-chain";

export { preferredRdns } from "./rdns-storage";
export type { Eip1193Provider, Eip6963ProviderDetail };

const log = createLogger("eip1193");

/// How long to wait for the requested wallet to announce.
const ANNOUNCE_WAIT_MS = 400;

export interface Eip1193State {
  status: ConnectionStatus;
  provider?: Eip1193Provider | undefined;
  rdns?: string | undefined;
  address?: `0x${string}` | undefined;
  chainId?: number | undefined;
  error?: string | undefined;
  /// All EIP-6963 providers seen so far (deduped by uuid).
  discovered: Eip6963ProviderDetail[];
}

const initial: Eip1193State = {
  status: "idle",
  discovered: [],
};

interface Handshake {
  address: `0x${string}`;
  chainId: number;
}

class Eip1193Store {
  private readonly store = createStore<Eip1193State>(initial);
  private detach: (() => void) | null = null;
  private readonly registry = new ProviderRegistry();
  private connecting = false;
  /// Bumped by `disconnect`, so an in-flight resume can tell its session was abandoned.
  private generation = 0;

  constructor() {
    this.registry.subscribe(() => this.set({ discovered: this.registry.list() }));
  }

  getState = (): Eip1193State => this.store.getState();

  subscribe = (listener: () => void): (() => void) => this.store.subscribe(listener);

  private set(patch: Partial<Eip1193State>): void {
    this.store.setState({ ...this.store.getState(), ...patch });
  }

  /// Ask wallets to announce themselves. Safe to call repeatedly.
  startDiscovery(): void {
    this.registry.start();
  }

  /// Find an announced provider; see `ProviderRegistry.pick`.
  pickProvider(rdns?: string): Eip6963ProviderDetail | undefined {
    return this.registry.pick(rdns);
  }

  /// Prompt the given (or default) wallet to connect, latch it, and persist its `rdns`.
  connect = async (rdns?: string): Promise<void> => {
    if (typeof window === "undefined") return;
    if (this.connecting) return;
    this.connecting = true;
    this.set({ status: "connecting", error: undefined });
    try {
      if (this.registry.list().length === 0) this.startDiscovery();
      const pick = await this.awaitProvider(rdns);
      if (!pick) {
        this.set({ status: "error", error: this.notFoundMessage(rdns) });
        return;
      }
      const shake = await this.handshake(pick.provider, "eth_requestAccounts");
      if (!shake) throw new Error("Wallet returned no accounts.");
      this.attach(pick, shake);
      rememberRdns(pick.info.rdns);
      log.info("connected", { rdns: pick.info.rdns, ...shake });
    } catch (err) {
      log.warn("connect failed", err);
      this.set({
        status: "error",
        error: userMessage(err),
      });
    } finally {
      this.connecting = false;
    }
  };

  /// Silent reconnect via `eth_accounts` on page load; stays `idle` on any miss.
  resumeFromStorage = async (): Promise<void> => {
    if (typeof window === "undefined") return;
    this.startDiscovery();
    const rdns = attachedRdns();
    if (!rdns) return;
    const generation = this.generation;
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
      if (this.connecting || this.getState().status === "connected") {
        log.debug("resume: superseded by an explicit connect; discarding");
        return;
      }
      if (this.generation !== generation) {
        log.debug("resume: disconnected while handshaking; discarding");
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
    const provider = this.getState().provider;
    if (!provider) throw new Error("Wallet not connected.");
    return switchWalletChain(provider, chain);
  };

  disconnect = (): void => {
    this.generation += 1;
    this.detach?.();
    this.detach = null;
    forgetAttachedRdns();
    this.set({
      status: "idle",
      provider: undefined,
      rdns: undefined,
      address: undefined,
      chainId: undefined,
      error: undefined,
    });
  };

  /// Wait out the announcement window for the requested wallet.
  private awaitProvider(rdns?: string): Promise<Eip6963ProviderDetail | undefined> {
    return this.registry.waitFor(() => this.registry.pick(rdns), ANNOUNCE_WAIT_MS);
  }

  /// The provider's account and chain, or `undefined` if either is missing.
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

  /// Latch the picked provider, replacing any prior provider's listeners.
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
      address,
      chainId,
      error: undefined,
    });
  }

  /// Restore the store to its boot state. For tests.
  resetForTest = (): void => {
    this.detach?.();
    this.detach = null;
    this.connecting = false;
    this.registry.reset();
    this.store.setState({ status: "idle", discovered: [] });
  };

  /// The not-found error, naming the wallet as the picker showed it.
  private notFoundMessage(rdns?: string): string {
    if (!rdns) {
      return "No EVM wallet detected. Install MetaMask, Rabby or another browser wallet.";
    }
    const known = this.registry.find(rdns);
    return `${known?.info.name ?? rdns} did not respond. Is it installed and unlocked?`;
  }
}

export const eip1193Store = new Eip1193Store();

/// The wallet's chain at call time. Check before a spend: a render-time chain may be stale.
export function currentWalletChainId(): bigint | undefined {
  const id = eip1193Store.getState().chainId;
  return id === undefined ? undefined : BigInt(id);
}
