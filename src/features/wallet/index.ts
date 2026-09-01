// Public surface of the `wallet` feature.
//
// Everything another feature is allowed to reach for, in one place. Anything
// not re-exported here is internal: it can be renamed or moved without
// checking the rest of the app. Within the feature, import the modules
// directly — routing local imports back through this file would create a
// cycle through the barrel.

export { AccountCard } from "./AccountCard";
export { ConnectButton } from "./ConnectButton";
export { clearCachedSubscription, resolveSyncStrategy } from "./fmd-subscription";
export { networkPreset } from "./network-preset";
export type { NskParseError } from "./nsk-codec";
export { NSK_HEX_LEN, nskFieldFromHex, nskHexFromField } from "./nsk-codec";
export { instrumentWallet } from "./perf";
export type {
  Permit2AllowanceState,
  SetupEntry,
  SetupProgress,
  SetupStep,
  SetupStepPhase,
} from "./permit2";
export {
  approvePermit2,
  defaultAllowanceCap,
  defaultAllowanceExpirationSecs,
  ensurePermit2AuthorizedSetupBatch,
  needsPermit2Approval,
  readPermit2AllowanceState,
  SAFETY_BUFFER_SECS,
  UNLIMITED_ALLOWANCE,
} from "./permit2";
export { getProverWorker, preloadProverWorker } from "./prover/prover-worker";
export { WalletProvider } from "./provider";
export { SyncErrorNotice } from "./SyncErrorNotice";
export { createScanner } from "./scanner";
export { IdbNoteStore } from "./stores/note-store";
export { useSyncProgress } from "./sync-progress-store";
export type { WalletContextValue, WalletStatus } from "./types";
export type { ConnectionBundle } from "./use-connection";
export { useConnection } from "./use-connection";
export { useScannerOwner } from "./use-scanner-owner";
export { useSpendableMax } from "./use-spendable-max";
export { useWallet } from "./use-wallet";
export type { AssetBalance, WalletState } from "./use-wallet-state";
export {
  useCompactNotes,
  useHardRefresh,
  useInvalidateWalletState,
  useWalletState,
} from "./use-wallet-state";
export { Welcome } from "./Welcome";
