export type { EphemeralBalance } from "./ephemeral/ephemeral-wallet";
export {
  buildEphemeralWallet,
  clearEphemeralStore,
  deriveEphemeralAddress,
  scanEphemeralBalances,
  sweepEphemeral,
} from "./ephemeral/ephemeral-wallet";
export type { GenerateClaimLinkResult } from "./ephemeral/generate";
export { generateClaimLink } from "./ephemeral/generate";
export { linkProbe } from "./ephemeral/seed-links";
export { readFragmentFromHash, scrubLocationHash } from "./link/fragment";
export { ClaimLinkVault } from "./vault/components/ClaimLinkVault";
export { EvictionBlock } from "./vault/components/EvictionBlock";
export { VaultSummary } from "./vault/components/VaultSummary";
export { daysLabel, retentionSentence } from "./vault/copy";
export { claimLinksSnapshot, markClaimLinkCopied, rememberClaimLink } from "./vault/store";
export { useLinkVault } from "./vault/use-link-vault";
