// Persisted names: a changed spelling silently orphans stored data, including claim-link keys.

export const LOCAL_KEYS = {
  /// The explicit light/dark choice. Also spelled independently in `public/theme-init.js`.
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
  fmdSubscriptionPrefix: "lelantos:fmd-sub:v1:",
  /// The last chain registry fetched from these two services.
  chainRegistry: (registryUrl: string, relayerUrl: string) =>
    `lelantos.chain-registry.v1.${registryUrl}|${relayerUrl}`,
} as const;

export const SESSION_KEYS = {
  /// Prefix of the per-account nsk cache.
  nskPrefix: "lelantos:nsk:v1:",
  /// A reload was already attempted for a stale route chunk.
  chunkReload: "lelantos:chunk-reload",
} as const;

/// The IndexedDB database holding the note, tree and nullifier stores.
export const IDB_NAME = "lelantos";
