export type { EphemeralBalance } from "./ephemeral/ephemeral-wallet";
export {
  buildEphemeralWallet,
  clearEphemeralStore,
  deriveEphemeralAddress,
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
