// Public surface of the `claim-links` feature: what a claim link is and where
// this browser keeps the ones it made.
//
// The link format (`codec.ts`, `fragment.ts`), the ephemeral bearer wallet a
// link spends from, the local vault of generated links, and the vault screen.
// Two flows build on it — Send by link creates links and shows the vault's
// summary, Claim reads and sweeps one — and `/links` renders the vault itself,
// so none of it can live inside a single flow.

export type { EphemeralBalance, GenerateClaimLinkResult } from "./ephemeral-wallet";
export {
  buildEphemeralWallet,
  clearEphemeralStore,
  generateClaimLink,
  summarizeEphemeralNotes,
  sweepEphemeral,
} from "./ephemeral-wallet";
export { readFragmentFromHash, scrubLocationHash } from "./fragment";
export { claimLinksSnapshot, markClaimLinkCopied, rememberClaimLink } from "./link-vault/store";
export { useLinkAssetsFor, useLinkVault } from "./use-link-vault";
export { ClaimLinkVault } from "./vault/ClaimLinkVault";
export { EvictionBlock } from "./vault/EvictionBlock";
export { VaultSummary } from "./vault/VaultSummary";
export { daysLabel, retentionSentence } from "./vault-copy";
