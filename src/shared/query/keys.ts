function chain(chainId: bigint | undefined): string | null {
  return chainId?.toString() ?? null;
}

/// React Query hashes keys with `JSON.stringify`, which throws on a bigint.
function big(value: bigint | undefined): string | null {
  return value?.toString() ?? null;
}

function transparentBalances(chainId: bigint | undefined, account: string | undefined) {
  return ["transparent-balances", chain(chainId), account ?? null] as const;
}

function setupStatusOf(chainId?: bigint, payer?: string) {
  return ["permit2-setup-status", chain(chainId), payer ?? null] as const;
}

function governance(chainId: bigint | undefined) {
  return ["governance", chain(chainId)] as const;
}

function names(chainId: bigint | undefined, registrar: string | undefined) {
  return ["names", chain(chainId), registrar?.toLowerCase() ?? null] as const;
}

/// Every React Query key the app uses; family keys are prefixes of their members.
export const queryKeys = {
  /// The chains this deployment serves, from protocol-webserver and the relayer.
  chainRegistry: () => ["chain-registry"] as const,

  /// USD prices for every served chain; not chain-scoped.
  prices: () => ["asset-prices"] as const,

  systemHealth: () => ["system-health"] as const,

  /// The note feed's watermark on one chain.
  syncHead: (chainId?: bigint) => ["sync-head", chain(chainId)] as const,

  walletState: (chainId?: bigint, address?: string) =>
    ["wallet-state", chain(chainId), address ?? null] as const,

  /// The relayer's fee quote for one account on one chain; without `kind`, the prefix of every kind.
  feeQuote: (chainId: bigint, account: string | undefined, kind?: string): readonly unknown[] => {
    const prefix = ["fee-quote", chain(chainId), account ?? null] as const;
    return kind === undefined ? prefix : [...prefix, kind];
  },

  /// What one asset's protocol fee on one leg is computed from; independent of the amount.
  feeInputs: (chainId: bigint, asset: bigint | undefined, leg: string) =>
    ["fee-inputs", chain(chainId), big(asset), leg] as const,

  /// The most a wallet can spend of one asset; `holdings` fingerprints the notes it depends on.
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

  /// Prefix of every `sourceBalance` for one address on one chain.
  transparentBalances,

  /// The public balance a deposit of one asset draws on (the native coin on the ETH path).
  sourceBalance: (
    chainId: bigint | undefined,
    account: string | undefined,
    asset: bigint | undefined,
    asEth: boolean,
  ) => [...transparentBalances(chainId, account), asEth ? "native" : big(asset)] as const,

  /// Permit2 setup state for one (chain, payer, token); keyed by lowercased token, not asset id.
  setupStatus: (chainId?: bigint, payer?: string, token?: string) =>
    [...setupStatusOf(chainId, payer), token?.toLowerCase() ?? null] as const,

  /// A swap route, keyed by the flattened request.
  swapQuote: (request: string) => ["swap-quote", request] as const,

  assetLadder: (chainId: bigint, asset: bigint | undefined) =>
    ["asset-ladder", chain(chainId), big(asset)] as const,

  /// Prefix of every governance key on one chain, so one invalidation refreshes them all.
  governance,

  /// The indexed proposal list, with each proposal's on-chain state.
  governanceProposals: (chainId: bigint | undefined) =>
    [...governance(chainId), "proposals"] as const,

  /// The on-chain state and quorum of the listed proposals, keyed by their ids.
  governanceProposalStates: (chainId: bigint | undefined, ids: string) =>
    [...governance(chainId), "proposals", "chain", ids] as const,

  /// One proposal as the indexer describes it.
  governanceProposal: (chainId: bigint | undefined, proposalId: string) =>
    [...governance(chainId), "proposal", proposalId] as const,

  /// One proposal's live on-chain figures, as seen by `account` (`null` read-only).
  governanceProposalChain: (
    chainId: bigint | undefined,
    proposalId: string,
    account: string | undefined,
  ) => [...governance(chainId), "proposal-chain", proposalId, account ?? null] as const,

  /// The indexed votes on one proposal, paginated.
  governanceVotes: (chainId: bigint | undefined, proposalId: string) =>
    [...governance(chainId), "votes", proposalId] as const,

  /// How far the governor's clock is from this browser's, in seconds.
  governanceClock: (chainId: bigint | undefined) => [...governance(chainId), "clock"] as const,

  /// One account's LNT balance, delegate and voting power.
  governanceVotingPower: (chainId: bigint | undefined, account: string | undefined) =>
    [...governance(chainId), "voting-power", account ?? null] as const,

  /// Prefix of every read of one handle registrar, so a registration refreshes them all.
  names,

  /// One handle's record: its published value and controller.
  nameRecord: (chainId: bigint | undefined, registrar: string | undefined, label: string) =>
    [...names(chainId, registrar), "record", label] as const,

  /// Whether one label can still be claimed.
  nameAvailable: (chainId: bigint | undefined, registrar: string | undefined, label: string) =>
    [...names(chainId, registrar), "available", label] as const,

  /// What the registrar charges for a registration.
  nameFee: (chainId: bigint | undefined, registrar: string | undefined) =>
    [...names(chainId, registrar), "fee"] as const,

  /// The shielded address one account publishes under its handle; `account` is its shielded address.
  publishedAddress: (chainId: bigint, account: string) =>
    ["published-address", chain(chainId), account] as const,
};
