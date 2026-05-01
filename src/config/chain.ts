// `walletStore.switchChain` reads add-chain params directly from `env`,
// so rpcUrl / explorerUrl are intentionally absent here.

import { env } from "@/config/env";

export const targetChain = {
  id: Number(env.chainId),
  name: env.chainName,
} as const;
