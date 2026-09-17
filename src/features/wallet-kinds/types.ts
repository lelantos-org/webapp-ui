import type { EthSigner } from "@lelantos-org/sdk";
import type { Field } from "@lelantos-org/sdk/primitives";
import type { ChainEntry } from "@/config/chains";
import type { Eip1193Provider } from "./eip1193/provider";

export type WalletKind = "eip1193" | "passkey";

/// Where a kind's store is in its connect lifecycle.
export type ConnectionStatus = "idle" | "connecting" | "connected" | "error";

/// What `buildWallet` needs to construct the chain layer.
export type ChainLayerSpec =
  | { kind: "eip1193"; provider: Eip1193Provider; address: `0x${string}` }
  | { kind: "passkey"; credentialId: string };

/// One kind's view of the world, read from whichever store owns it.
export interface KindSnapshot {
  connected: boolean;
  connecting: boolean;
  error?: string | undefined;
  /// Opaque, stable account identity; namespaces the nsk cache and note stores.
  accountKey?: string | undefined;
  /// Present only for kinds that hold a public Ethereum account.
  ethAddress?: `0x${string}` | undefined;
  /// The wallet's network for `chainSource: "wallet"`, the user's selection for `"app"`.
  chainId?: bigint | undefined;
  layer?: ChainLayerSpec | undefined;
}

/// How a kind produces a shielded spending key, and what it costs the user.
export interface KeySourcePlan {
  /// The EVM signer, if any. Absent means a read-only layer: can spend, cannot shield.
  signer?: EthSigner;
  derive(): Promise<Field>;
  /// Names the prompt in logs. The user-facing wording is `deriving` below.
  prompt: string;
}

/// The per-kind copy that would otherwise be a ternary in a component.
export interface KindCopy {
  /// Row label in the wallet picker.
  label(): string;
  /// Shown while the key is derived; `warn` is what the user must read before approving.
  deriving: { title: string; body: string; note: string; warn?: string };
  /// Replaces the eth-address row for a kind with no public account.
  accountNote?: string;
  /// Extra paragraphs on the "cannot deposit" panel, after the reason.
  noDepositAdvice?: string[];
  /// Why this kind cannot deposit, in the user's terms.
  noDepositReason: string;
}

export interface WalletKindAdapter {
  readonly kind: WalletKind;
  /// `"wallet"`: the wallet owns the network. `"app"`: the app selects one.
  readonly chainSource: "wallet" | "app";
  readonly copy: KindCopy;
  /// Whether this kind can be offered on this device at all.
  available(): boolean;
  useSnapshot(): KindSnapshot;
  /// Begin a session; `id` picks the instance (extension rdns). Call via `selectKind`, never directly.
  attach(id?: string): void;
  disconnect(): void;
  switchChain(target: ChainEntry): void;
  keySource(layer: ChainLayerSpec, chain: ChainEntry): KeySourcePlan;
}
