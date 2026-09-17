// Wallet kinds. At most one is connected at a time, enforced by `selectKind`.

export type { Eip6963ProviderDetail } from "./eip1193/discovery";
export { currentWalletChainId, eip1193Store, preferredRdns } from "./eip1193/store";
export { useSwitchChain } from "./eip1193/use-switch-chain";
export type { NskParseError } from "./key-cache/nsk-codec";
export { NSK_HEX_LEN, nskFieldFromHex, nskHexFromField } from "./key-cache/nsk-codec";
export {
  cacheNsk,
  clearAllCachedNsk,
  clearCachedNsk,
  getCachedNsk,
} from "./key-cache/nsk-session-cache";
export { kindAdapter, selectKind, useWalletKinds, WALLET_KINDS } from "./kinds";
export { storedCredential } from "./passkey/credential-storage";
export type { ChainLayerSpec, WalletKind } from "./types";
