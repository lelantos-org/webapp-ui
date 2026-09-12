// The wallet kinds this app supports, and which one holds the session.
//
// Adding a kind is one adapter file plus one entry in `WALLET_KINDS`. Nothing
// downstream branches on `kind`: the chain source, the key derivation, the
// picker row and the per-kind copy all travel on the adapter.
//
// The invariant everything here rests on: at most one kind is connected at a
// time, maintained by `selectKind`, which is the only supported way to begin a
// session. Without it the tie is broken by array order — which made a passkey
// unselectable, since an injected wallet outranks one and reattaches itself
// silently on load.
//
// Each kind's own machinery sits beside its adapter:
//
//   `eip1193/`    the injected browser wallet — EIP-6963 discovery, the
//                 connection store, chain switching.
//   `passkey/`    WebAuthn PRF in, shielded spending key out — the ceremony, the
//                 state machine and the two persisted `localStorage` keys. A
//                 passkey cannot deposit: shielding moves public tokens out of an
//                 EVM account it does not hold (see `wallet/session/capabilities`).
//   `key-cache/`  the spending key's hex encoding and its per-tab session cache.
//                 The bottom layer: `passkey/` seeds the cache on enrolment and
//                 `features/wallet` reads it on build, so it imports neither.

import { eip1193Kind } from "./eip1193-kind";
import { passkeyKind } from "./passkey-kind";
import type { KindSnapshot, WalletKind, WalletKindAdapter } from "./types";

export type { Eip6963ProviderDetail } from "./eip1193/discovery";
export { currentWalletChainId, eip1193Store, preferredRdns } from "./eip1193/store";
export { useSwitchChain } from "./eip1193/use-switch-chain";
export type { NskParseError } from "./key-cache/nsk-codec";
export { NSK_HEX_LEN, nskFieldFromHex, nskHexFromField } from "./key-cache/nsk-codec";
export {
  cacheNsk,
  clearAllCachedNsk,
  clearCachedNsk,
  getCachedNsk,
} from "./key-cache/nsk-session-cache";
export { storedCredential } from "./passkey/credential-storage";
export type { ChainLayerSpec, WalletKind } from "./types";

/// Every kind, in the order ties are broken.
///
/// Ties should not arise, so this order decides one case only: a browser
/// carrying latches from before `selectKind` enforced the invariant. An injected
/// wallet wins there because it owns the chain, and a passkey taking precedence
/// would leave the app on a network the connected account is not on.
export const WALLET_KINDS: readonly WalletKindAdapter[] = [eip1193Kind, passkeyKind];

export function kindAdapter(kind: WalletKind): WalletKindAdapter {
  const found = WALLET_KINDS.find((a) => a.kind === kind);
  if (!found) throw new Error(`no adapter for wallet kind ${kind}`);
  return found;
}

/// Hand the session to `kind`, detaching every other.
///
/// The one place the "at most one kind connected" invariant is maintained, so
/// that `activeKind` never has to guess. `id` names which instance to attach
/// where the kind has several — see `WalletKindAdapter.attach`.
export function selectKind(kind: WalletKind, id?: string): void {
  for (const adapter of WALLET_KINDS) {
    if (adapter.kind !== kind) adapter.disconnect();
  }
  kindAdapter(kind).attach(id);
}

export interface ActiveKind {
  adapter: WalletKindAdapter;
  snapshot: KindSnapshot;
}

/// The live session, and every kind's snapshot.
export function useWalletKinds(): {
  active: ActiveKind | undefined;
  snapshots: ActiveKind[];
} {
  const snapshots: ActiveKind[] = [];
  for (const adapter of WALLET_KINDS) {
    // Legal despite the loop: `WALLET_KINDS` is a module constant, so the hook
    // count and order are fixed. Suppressed rather than rewritten to name each
    // kind, which would cost the property that adding one touches a single array.
    // biome-ignore lint/correctness/useHookAtTopLevel: WALLET_KINDS is a module constant, so the hook order is fixed.
    snapshots.push({ adapter, snapshot: adapter.useSnapshot() });
  }
  // `find`, not a priority scan: `selectKind` leaves at most one connected. See
  // `WALLET_KINDS` for the one case where that does not hold.
  return { active: snapshots.find((s) => s.snapshot.connected), snapshots };
}
