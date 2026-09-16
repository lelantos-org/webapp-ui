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
export { kindAdapter, selectKind, useWalletKinds, WALLET_KINDS } from "./kinds";
export { storedCredential } from "./passkey/credential-storage";
export type { ChainLayerSpec, WalletKind } from "./types";
