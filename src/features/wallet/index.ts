// Public surface of the `wallet` feature.
//
// Laid out by concern:
//
//   `connect/`      the connection UI — Welcome, the wallet picker, the account pill.
//   `session/`      who is connected and what they may do; `WalletProvider`.
//   `build/`        turning a session into an SDK `WalletApi` (the lazy chunk).
//   `sync/`         scanning, sync progress and the decrypted wallet state.
//   `stores/`       the IndexedDB persistence the SDK stores sit on.
//   `maintenance/`  clearing spent notes and wiping local wallet data (the hooks;
//                   the "Manage wallet data" UI lives with the portfolio in `assets`).
//   `prover/`       the proving worker, shared by every wallet in the tab.

export { networkPreset } from "./build/network-preset";
export { instrumentWallet } from "./build/perf";
export { AccountCard } from "./connect/AccountCard";
export { ConnectButton } from "./connect/ConnectButton";
export { ConnectedGate } from "./connect/ConnectedGate";
export { useCompactNotes, useHardRefresh } from "./maintenance/note-maintenance";
export { preloadProverWorker, sharedProver } from "./prover/prover-worker";
export type { Capability, WalletCapabilities } from "./session/capabilities";
export type { WalletContextValue, WalletStatus } from "./session/context";
export { useWallet, useWalletInstance } from "./session/context";
export { useSession } from "./session/session";
export { WalletProvider } from "./session/WalletProvider";
export { IdbNoteStore } from "./stores/note-store";
export type { AssetBalance } from "./sync/balances";
export { computeBalances, heldNotes } from "./sync/balances";
export { clearCachedSubscription, resolveSyncStrategy } from "./sync/fmd-subscription";
export { SyncNotice } from "./sync/SyncNotice";
export { createScanner, holdScanner } from "./sync/scanner";
export { useSyncProgress } from "./sync/sync-progress-store";
export { useScannerOwner } from "./sync/use-scanner-owner";
export { useSpendableMax } from "./sync/use-spendable-max";
export type { WalletState } from "./sync/use-wallet-state";
export { useInvalidateWalletState, useWalletState } from "./sync/use-wallet-state";
