// Public surface of the `claim-links` feature: what a claim link is and where
// this browser keeps the ones it made.
//
// The link format (`link/`), the ephemeral bearer wallet a link spends from
// (`ephemeral/`), and the local vault of generated links with its screens
// (`vault/`).
// Two flows build on it — Send by link creates links and shows the vault's
// summary, Claim reads and sweeps one — and `/links` renders the vault itself,
// so none of it can live inside a single flow.

export type { EphemeralBalance } from "./ephemeral/ephemeral-wallet";
export {
  buildEphemeralWallet,
  clearEphemeralStore,
  summarizeEphemeralNotes,
  sweepEphemeral,
} from "./ephemeral/ephemeral-wallet";
export type { GenerateClaimLinkResult } from "./ephemeral/generate";
export { generateClaimLink } from "./ephemeral/generate";
export { readFragmentFromHash, scrubLocationHash } from "./link/fragment";
export { ClaimLinkVault } from "./vault/components/ClaimLinkVault";
export { EvictionBlock } from "./vault/components/EvictionBlock";
export { VaultSummary } from "./vault/components/VaultSummary";
export { daysLabel, retentionSentence } from "./vault/copy";
export { claimLinksSnapshot, markClaimLinkCopied, rememberClaimLink } from "./vault/store";
export { useLinkAssetsFor, useLinkVault } from "./vault/use-link-vault";
