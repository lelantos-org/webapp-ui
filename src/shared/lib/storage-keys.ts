// Every name this app writes browser storage under, in one place.
//
// These strings are persisted: a changed spelling orphans whatever a returning
// user has stored under the old one — a cached key, a synced tree, a claim link
// whose spending key exists nowhere else — with nothing failing to say so. Bump
// a version segment deliberately, never by accident; seeing them side by side is
// the point of the list. Nothing here may import anything.

export const LOCAL_KEYS = {
  /// The explicit light/dark choice. Also read by `public/theme-init.js`, which
  /// cannot import this file and spells it independently.
  theme: "lelantos:theme",
  /// Verbose logging switch (`window.__lelantosDebug`).
  debug: "lelantos:debug",
  /// Claim links this browser generated, each carrying its bearer spending key.
  claimLinks: "lelantos:claim-links:v1",
  /// Recent proving durations, for the progress card's estimate.
  proveDurations: "lelantos:prove-durations",
  /// The injected wallet to reattach to on load.
  walletRdns: "lelantos:wallet:rdns",
  /// The injected wallet the picker offers first.
  preferredRdns: "lelantos:wallet:preferred-rdns",
  /// The enrolled passkey credential.
  passkeyCredential: "lelantos:passkey:v1:credential",
  /// Whether this device is attached to that credential.
  passkeyAttached: "lelantos:passkey:v1:attached",
  /// The chain a passkey session selected.
  passkeyChain: "lelantos:passkey:v1:chain",
  /// The authenticator has been shown to lack PRF.
  passkeyNoPrf: "lelantos:passkey:v1:no-prf",
  /// Prefix of the cached FMD subscription tokens, one per (chain, account).
  fmdSubscriptionPrefix: "lelantos:fmd-sub:v3:",
  /// Prefixes of per-block yield caches older builds wrote, swept on load.
  retiredYieldPrefixes: ["lelantos:yield-idx:", "lelantos:yield-basis:"],
  /// The last chain registry fetched from these two services.
  chainRegistry: (registryUrl: string, relayerUrl: string) =>
    `lelantos.chain-registry.v2.${registryUrl}|${relayerUrl}`,
} as const;

export const SESSION_KEYS = {
  /// Prefix of the per-account nsk cache.
  nskPrefix: "lelantos:nsk:v3:",
  /// A reload was already attempted for a stale route chunk.
  chunkReload: "lelantos:chunk-reload",
} as const;

/// The IndexedDB database holding the note, tree and nullifier stores.
export const IDB_NAME = "lelantos-wallet";
