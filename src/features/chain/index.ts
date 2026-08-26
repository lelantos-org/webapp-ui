// Public surface of the `chain` feature.
//
// Everything another feature is allowed to reach for, in one place. Anything
// not re-exported here is internal: it can be renamed or moved without
// checking the rest of the app. Within the feature, import the modules
// directly — routing local imports back through this file would create a
// cycle through the barrel.

export { ChainBadge } from "./ChainBadge";
export {
  ChainProvider,
  useActiveChain,
  useActiveChainOrUndefined,
  useChainRegistry,
} from "./ChainProvider";
export { ChainSwitchButtons } from "./ChainSwitchButtons";
export { SupportedNetworks } from "./SupportedNetworks";
export { useTxExplorerUrl } from "./use-explorer-url";
