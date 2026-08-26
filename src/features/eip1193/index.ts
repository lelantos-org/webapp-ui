// Public surface of the `eip1193` feature.
//
// Everything another feature is allowed to reach for, in one place. Anything
// not re-exported here is internal: it can be renamed or moved without
// checking the rest of the app. Within the feature, import the modules
// directly — routing local imports back through this file would create a
// cycle through the barrel.

export type { Eip1193Provider, Eip6963ProviderDetail } from "./store";
export { currentWalletChainId, preferredRdns, walletStore } from "./store";
export { useWalletStore } from "./use-store";
export { useSwitchChain } from "./use-switch-chain";
