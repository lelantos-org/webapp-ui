// Every React Query key the app uses, in one place.
//
// A key is a contract between the query that fills a cache entry and whatever
// invalidates, cancels or reads it, and those are often in different modules:
// the wallet refreshes the fee quote after a sync, a spend invalidates the
// transparent balances a form reads. An invalidation whose key matches nothing
// raises no error, so the spellings live here rather than as literals at each
// end.
//
// Keys that name a family — the fee quotes of one account, the transparent
// balances of one address — are prefixes of their members, so invalidating the
// prefix covers every member.

/// A chain id as it appears in a key: decimal, and `null` while there is none.
function chain(chainId: bigint | undefined): string | null {
  return chainId?.toString() ?? null;
}

/// A bigint (an asset id, an amount) as it appears in a key. React Query hashes
/// keys with `JSON.stringify`, which throws on a bigint.
function big(value: bigint | undefined): string | null {
  return value?.toString() ?? null;
}

function transparentBalances(chainId: bigint | undefined, account: string | undefined) {
  return ["transparent-balances", chain(chainId), account ?? null] as const;
}

function setupStatusOf(chainId?: bigint, payer?: string) {
  return ["permit2-setup-status", chain(chainId), payer ?? null] as const;
}

export const queryKeys = {
  /// The chains this deployment serves, from protocol-webserver and the relayer.
  chainRegistry: () => ["chain-registry"] as const,

  /// USD prices. Not chain-scoped: the body covers every chain the deployment
  /// serves, so a chain-scoped key would refetch the same document on each
  /// network switch.
  prices: () => ["asset-prices"] as const,

  /// Reachability of the backing services.
  systemHealth: () => ["system-health"] as const,

  /// The note feed's watermark on one chain.
  syncHead: (chainId?: bigint) => ["sync-head", chain(chainId)] as const,

  /// A wallet's synced holdings. Chain-scoped as well as address-scoped: the
  /// address is the same on every chain, so without the chainId a switch would
  /// serve the previous chain's balances from cache until the query next
  /// refetched.
  walletState: (chainId?: bigint, address?: string) =>
    ["wallet-state", chain(chainId), address ?? null] as const,

  /// The relayer's fee quote for one account on one chain, or — without `kind` —
  /// the prefix covering every kind for that account.
  ///
  /// Account-scoped because the quote is: each option carries this wallet's
  /// balance in the asset and whether it covers the charge (`quoteFee` reads the
  /// local notes). Keyed on the chain alone, a second account on the same chain
  /// was served the first one's balances until the quote went stale.
  feeQuote: (chainId: bigint, account: string | undefined, kind?: string): readonly unknown[] => {
    const prefix = ["fee-quote", chain(chainId), account ?? null] as const;
    return kind === undefined ? prefix : [...prefix, kind];
  },

  /// The protocol fee on one amount of one asset, for one leg. Asset ids are
  /// unique only within a chain, and the two legs are priced apart.
  feePreview: (chainId: bigint, leg: string, asset?: bigint, amount?: bigint) =>
    ["fee-preview", chain(chainId), leg, big(asset), big(amount)] as const,

  /// One asset's protocol rate for one leg, independent of the amount.
  feeBps: (chainId: bigint, asset: bigint | undefined, leg: string) =>
    ["fee-bps", chain(chainId), big(asset), leg] as const,

  /// The most a wallet can spend of one asset. `holdings` fingerprints the notes
  /// it depends on, so a sync that moved nothing does not mint a new entry.
  spendableMax: (
    chainId: bigint,
    account: string | undefined,
    asset: bigint | undefined,
    holdings: string,
    spend: { kind: string; feeAsset: bigint | undefined; native: boolean; quotedFee: bigint },
  ) =>
    [
      "spendable-max",
      chain(chainId),
      account ?? null,
      big(asset),
      holdings,
      spend.kind,
      big(spend.feeAsset),
      spend.native,
      big(spend.quotedFee),
    ] as const,

  /// The yield index series for every earning asset on one chain.
  yieldIndex: (chainId: bigint) => ["yield-index", chain(chainId)] as const,

  /// Every public balance read for one address on one chain: the prefix of
  /// `sourceBalance`, so invalidating it covers them all.
  transparentBalances,

  /// The public balance a deposit of one asset draws on — the native coin on the
  /// native-ETH path.
  sourceBalance: (
    chainId: bigint | undefined,
    account: string | undefined,
    asset: bigint | undefined,
    asEth: boolean,
  ) => [...transparentBalances(chainId, account), asEth ? "native" : big(asset)] as const,

  /// Permit2 setup state for one (chain, payer, token).
  ///
  /// Keyed by chain rather than by MASP address. The allowance window is a fact
  /// about (chain, payer, token): Permit2 and the pool are deployed per chain and
  /// the payer address is the same on all of them, so the chainId keeps one
  /// chain's completed setup from being read as another's.
  ///
  /// By **token**, not by asset id. Permit2 keys both halves of setup — the ERC-20
  /// approval and the `(owner, token, spender)` allowance — by token, and the pool
  /// registers a separate id per yield variant over the same ERC-20. Keyed by id,
  /// every variant re-probes its shared token: six ids over three tokens cost six
  /// probes on every modal mount and window focus, about five RPC round trips
  /// each, for three distinct answers, growing with every yield variant added.
  /// Keyed by token the duplication cannot be expressed.
  ///
  /// Lowercased for the reason `by-token.ts` gives: `/chains` sends lowercase and
  /// the SDK hands back checksummed, so two spellings would be two cache entries.
  setupStatus: (chainId?: bigint, payer?: string, token?: string) =>
    [...setupStatusOf(chainId, payer), token?.toLowerCase() ?? null] as const,

  /// The prefix of `setupStatus` covering every token of one payer.
  setupStatusOf,

  /// A swap route, keyed by the flattened request (see `use-swap-quote`).
  swapQuote: (request: string) => ["swap-quote", request] as const,

  /// One asset's denomination ladder.
  assetLadder: (chainId: bigint, asset: bigint | undefined) =>
    ["asset-ladder", chain(chainId), big(asset)] as const,
};
