// Public surface of the `wallet` feature.
//
// Laid out by concern:
//
//   `connect/`  the connection UI — Welcome, the wallet picker, the account pill.
//   `session/`  who is connected and what they may do; `WalletProvider`.
//   `build/`    turning a session into an SDK `WalletApi` (the lazy chunk).
//   `sync/`     scanning, sync progress and the decrypted wallet state.
//   `stores/`   the IndexedDB persistence the SDK stores sit on.
//   `prover/`   the proving worker.

export { clearCachedSubscription, resolveSyncStrategy } from "./build/fmd-subscription";
export { networkPreset } from "./build/network-preset";
export { instrumentWallet } from "./build/perf";
export { AccountCard } from "./connect/AccountCard";
export { ConnectButton } from "./connect/ConnectButton";
export { ConnectedGate } from "./connect/ConnectedGate";
export { getProverWorker, preloadProverWorker } from "./prover/prover-worker";
export type { Capability, WalletCapabilities } from "./session/capabilities";
export { useSession } from "./session/session";
export type { WalletContextValue, WalletStatus } from "./session/use-wallet";
export { useWallet, useWalletInstance } from "./session/use-wallet";
export { WalletProvider } from "./session/WalletProvider";
export { IdbNoteStore } from "./stores/note-store";
export { SyncNotice } from "./sync/SyncNotice";
export { createScanner } from "./sync/scanner";
export { useSyncProgress } from "./sync/sync-progress-store";
export { useScannerOwner } from "./sync/use-scanner-owner";
export { useSpendableMax } from "./sync/use-spendable-max";
export type { AssetBalance, WalletState } from "./sync/use-wallet-state";
export {
  useCompactNotes,
  useHardRefresh,
  useInvalidateWalletState,
  useWalletState,
} from "./sync/use-wallet-state";
