// Authoritative wallet state, fed by the active EIP-1193 provider's
// `accountsChanged` / `chainChanged` events. A single provider is latched at
// connect-time (EIP-6963 may discover several); only its `rdns` is persisted,
// and boot resumes silently via `eth_accounts` (no popup).

import type { ChainEntry } from "@/config/chains";
import { createLogger } from "@/shared/lib/logger";

/// Minimal EIP-1193 contract.
export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

const log = createLogger("eip1193");

const STORAGE_KEY = "lelantos:wallet:rdns";

export interface Eip6963ProviderInfo {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
}

export interface Eip6963ProviderDetail {
  info: Eip6963ProviderInfo;
  provider: Eip1193Provider;
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
  /// EIP-6963 discovery state. Held on the instance so repeat calls to
  /// `startDiscovery` re-issue the request event rather than re-registering.
  private discoveryWired = false;
  private seen = new Map<string, Eip6963ProviderDetail>();

  getState = (): ConnectionState => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(patch: Partial<ConnectionState>): void {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }

  /// Run EIP-6963 discovery and merge results into `discovered`. Wallets can
  /// announce at any later time too, so the listener stays wired for the
  /// lifetime of the page.
  ///
  /// Safe to call repeatedly: boot reaches it from `WalletBoot`, from
  /// `resumeFromStorage` and from `connect`. Only the request event repeats.
  /// Registering the handler once keeps a single announce from producing one
  /// store notification per call.
  startDiscovery(): void {
    if (typeof window === "undefined") return;
    if (!this.discoveryWired) {
      this.discoveryWired = true;
      for (const d of this.state.discovered) this.seen.set(d.info.uuid, d);
      window.addEventListener("eip6963:announceProvider", this.onAnnounce);
    }
    window.dispatchEvent(new Event("eip6963:requestProvider"));
  }

  private onAnnounce = (e: Event): void => {
    const detail = (e as CustomEvent<Eip6963ProviderDetail>).detail;
    if (!detail?.info?.uuid) return;
    if (this.seen.has(detail.info.uuid)) return;
    this.seen.set(detail.info.uuid, detail);
    this.set({ discovered: Array.from(this.seen.values()) });
    log.debug("discovered", detail.info.rdns, detail.info.name);
  };

  /// Find an announced provider by rdns, falling back to MetaMask, then the
  /// first provider seen.
  pickProvider(rdns?: string): Eip6963ProviderDetail | undefined {
    const list = this.state.discovered;
    if (rdns) {
      const exact = list.find((d) => d.info.rdns.toLowerCase() === rdns.toLowerCase());
      if (exact) return exact;
    }
    return (
      list.find((d) => d.info.rdns === "io.metamask") ??
      list.find((d) => /metamask/i.test(d.info.name)) ??
      list[0]
    );
  }

  /// Pop the wallet's connect prompt for the given (or default) provider
  /// and latch it as the active one. Persists rdns so reloads stay connected.
  connect = async (rdns?: string): Promise<void> => {
    if (typeof window === "undefined") return;
    if (this.state.discovered.length === 0) this.startDiscovery();
    // Some wallets announce on the next tick after a request event.
    await new Promise((r) => setTimeout(r, 60));
    const pick = this.pickProvider(rdns);
    if (!pick) {
      this.set({ status: "error", error: "No wallet detected. Install MetaMask." });
      return;
    }
    this.set({ status: "connecting", error: undefined });
    try {
      const accounts = (await pick.provider.request({
        method: "eth_requestAccounts",
      })) as string[];
      const address = (accounts[0] ?? "").toLowerCase() as `0x${string}`;
      if (!address) throw new Error("Wallet returned no accounts.");
      const chainIdHex = (await pick.provider.request({ method: "eth_chainId" })) as string;
      const chainId = Number.parseInt(chainIdHex, 16);
      this.attach(pick, address, chainId);
      this.persistRdns(pick.info.rdns);
      log.info("connected", { rdns: pick.info.rdns, address, chainId });
    } catch (err) {
      log.warn("connect failed", err);
      this.set({
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };

  /// Silent reconnect on page load via `eth_accounts` (no wallet popup).
  /// Falls closed (status stays `idle`) on any miss.
  resumeFromStorage = async (): Promise<void> => {
    if (typeof window === "undefined") return;
    this.startDiscovery();
    const rdns = (() => {
      try {
        return window.localStorage?.getItem(STORAGE_KEY) ?? undefined;
      } catch {
        return undefined;
      }
    })();
    if (!rdns) return;
    // Wait briefly for the wallet extension to announce.
    await new Promise((r) => setTimeout(r, 120));
    const pick = this.pickProvider(rdns);
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
      const chainIdHex = (await pick.provider.request({ method: "eth_chainId" })) as string;
      const chainId = Number.parseInt(chainIdHex, 16);
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
    try {
      window.localStorage?.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
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
    const onChainChanged = (hexId: unknown) => {
      const id = typeof hexId === "string" ? Number.parseInt(hexId, 16) : Number(hexId);
      log.debug("chainChanged", id);
      if (Number.isFinite(id)) this.set({ chainId: id });
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

  private persistRdns(rdns: string): void {
    try {
      window.localStorage?.setItem(STORAGE_KEY, rdns);
    } catch {
      // ignore (private mode, etc)
    }
  }
}

export const walletStore = new WalletStore();
