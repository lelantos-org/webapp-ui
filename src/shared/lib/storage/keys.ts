// Persisted names: a changed spelling silently orphans stored data, including claim-link keys.

export const LOCAL_KEYS = {
  /// The explicit light/dark choice. Also spelled independently in `public/theme-init.js`.
  theme: "lelantos:theme",
  /// Privacy mode is on: held figures are masked.
  hideAmounts: "lelantos:hide-amounts",
  /// Verbose logging switch (`window.__lelantosDebug`).
  debug: "lelantos:debug",
  /// Claim links this browser generated, each carrying its bearer spending key.
  claimLinks: "lelantos:claim-links:v1",
  /// Prefix of the next claim-link index to try, one per (chain, account). A hint only: the index
  /// taken is always checked against the chain.
  claimLinkNextPrefix: "lelantos:claim-link-next:v1:",
  /// Agent wallets this browser funded, each holding a long-lived spending key. Never expired:
  /// the stored `nsk` is the only copy, and dropping a record strands the agent's funds.
  agents: "lelantos:agents:v1",
  /// Prefix of the asset last sent, one per chain: what a spend form opens on.
  lastAssetPrefix: "lelantos:last-asset:v1:",
  /// Recent proving durations, for the progress card's estimate.
  proveDurations: "lelantos:prove-durations",
  /// The injected wallet to reattach to on load.
  walletRdns: "lelantos:wallet:rdns",
  /// The injected wallet the picker offers first.
  preferredRdns: "lelantos:wallet:preferred-rdns",
  passkeyCredential: "lelantos:passkey:v1:credential",
  /// Whether this device is attached to the enrolled credential.
  passkeyAttached: "lelantos:passkey:v1:attached",
  /// The chain a passkey session selected.
  passkeyChain: "lelantos:passkey:v1:chain",
  /// The authenticator has been shown to lack PRF.
  passkeyNoPrf: "lelantos:passkey:v1:no-prf",
  /// Service URLs the user chose in place of the build's.
  endpoints: "lelantos:endpoints:v1",
  /// Prefix of the cached FMD subscription tokens, one per (chain, account).
  fmdSubscriptionPrefix: "lelantos:fmd-sub:v1:",
  /// The last chain registry fetched from these two services.
  chainRegistry: (registryUrl: string, relayerUrl: string) =>
    `lelantos.chain-registry.v1.${registryUrl}|${relayerUrl}`,
} as const;

export const SESSION_KEYS = {
  /// The transactions running in this tab, rewritten as they progress.
  opsRunning: "lelantos:ops:running",
  /// Transactions a reload cut short, until the user dismisses the notice.
  opsInterrupted: "lelantos:ops:interrupted",
  /// Prefix of the per-account nsk cache.
  nskPrefix: "lelantos:nsk:v1:",
  /// A reload was already attempted for a stale route chunk.
  chunkReload: "lelantos:chunk-reload",
} as const;

/// The IndexedDB database holding the note, tree and nullifier stores.
export const IDB_NAME = "lelantos";
