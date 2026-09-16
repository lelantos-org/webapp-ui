// What the app needs to know about a kind of wallet, as data.
//
// This module sits below both `features/chain` and `features/wallet` so either
// may import it. That placement is the point: the active chain depends on the
// wallet kind (an injected wallet owns its network, a passkey selects one), and
// the wallet layer depends on the chain, so the per-kind facts cannot live in
// either without a cycle.
//
// The rule for adding a wallet kind: write one adapter, add it to
// `WALLET_KINDS`, and change nothing else. Anything that would otherwise be a
// `kind === "passkey"` branch belongs on this interface instead.

import type { EthSigner } from "@lelantos-org/sdk";
import type { Field } from "@lelantos-org/sdk/primitives";
import type { ChainEntry } from "@/config/chains";
import type { Eip1193Provider } from "./eip1193/provider";

export type WalletKind = "eip1193" | "passkey";

/// Where a kind's store is in its connect lifecycle.
export type ConnectionStatus = "idle" | "connecting" | "connected" | "error";

/// What `buildWallet` needs to construct the chain layer.
///
/// The passkey variant carries no provider and no EVM account, because it has
/// neither: reads go straight to the chain's RPC and writes go to the relayer.
/// It carries the credential id, which is what the PRF ceremony addresses.
export type ChainLayerSpec =
  | { kind: "eip1193"; provider: Eip1193Provider; address: `0x${string}` }
  | { kind: "passkey"; credentialId: string };

/// One kind's view of the world, read from whichever store owns it.
export interface KindSnapshot {
  connected: boolean;
  connecting: boolean;
  error?: string | undefined;
  /// Stable identity for this account. Opaque: it namespaces the nsk cache and
  /// the note/tree/nullifier stores, and nothing parses it back apart.
  accountKey?: string | undefined;
  /// Present only for kinds that hold a public Ethereum account.
  ethAddress?: `0x${string}` | undefined;
  /// The network this kind reports. For `chainSource: "wallet"` it is what the
  /// wallet is on; for `"app"` it is what the user last selected.
  chainId?: bigint | undefined;
  layer?: ChainLayerSpec | undefined;
}

/// How a kind produces a shielded spending key, and what it costs the user.
export interface KeySourcePlan {
  /// The EVM signer, where this kind has one. Also what `connect()` builds its
  /// chain layer from — absent means a read-only layer, and therefore a wallet
  /// that can spend from the pool but not shield into it.
  signer?: EthSigner;
  derive(): Promise<Field>;
  /// Names the prompt in logs. The user-facing wording is `deriving` below.
  prompt: string;
}

/// The per-kind copy that would otherwise be a ternary in a component.
export interface KindCopy {
  /// Row label in the wallet picker.
  label(): string;
  /// Shown while the key is being derived.
  ///
  /// `warn` is rendered unmuted, above `note`, and exists for the one thing a
  /// user must read before approving rather than after. Optional: a kind whose
  /// derivation carries no standing risk leaves it out rather than inventing a
  /// warning to fill the slot.
  deriving: { title: string; body: string; note: string; warn?: string };
  /// Stands in for the eth-address row on the account card, for a kind that
  /// has no public account to show.
  accountNote?: string;
  /// Extra paragraphs on the "cannot deposit" panel, after the reason.
  noDepositAdvice?: string[];
  /// Why this kind cannot deposit, in the user's terms. Read only when the
  /// SDK's `supportsDeposit` guard has already said it cannot.
  noDepositReason: string;
}

export interface WalletKindAdapter {
  readonly kind: WalletKind;
  /// Where the active chain comes from.
  ///
  /// `"wallet"` — the wallet owns its network and the app follows it, so a
  /// network outside the registry is a hard stop. `"app"` — the wallet has no
  /// network to read, so the app selects one and there is nothing to be
  /// stranded on.
  readonly chainSource: "wallet" | "app";
  readonly copy: KindCopy;
  /// Whether this kind can be offered on this device at all.
  available(): boolean;
  useSnapshot(): KindSnapshot;
  /// Begin a session of this kind, from the picker.
  ///
  /// `id` names which instance to attach where a kind has several — the rdns of
  /// an installed extension; single-instance kinds ignore it. Call through
  /// `selectKind`, never directly: attaching without detaching the others breaks
  /// the one-session invariant.
  attach(id?: string): void;
  disconnect(): void;
  switchChain(target: ChainEntry): void;
  keySource(layer: ChainLayerSpec, chain: ChainEntry): KeySourcePlan;
}
