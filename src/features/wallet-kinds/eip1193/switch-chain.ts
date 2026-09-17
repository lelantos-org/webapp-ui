import type { ChainEntry } from "@/config/chains";
import { createLogger } from "@/shared/lib/logger";
import { isUnrecognizedChain } from "./errors";
import type { Eip1193Provider } from "./provider";

const log = createLogger("eip1193:switch-chain");

/// Move `provider` to `chain`, adding it and retrying on 4902. State follows via `chainChanged`.
export async function switchWalletChain(
  provider: Eip1193Provider,
  chain: ChainEntry,
): Promise<void> {
  const hexId = `0x${chain.chainId.toString(16)}`;
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: hexId }],
    });
    return;
  } catch (err) {
    if (!isUnrecognizedChain(err)) throw err;
    const target = { chainId: hexId, chainName: chain.chainName, rpcUrl: chain.rpcUrl };
    log.warn("chain unknown to the wallet; adding it", target);
    await addChain(provider, chain, hexId, target);
    // Some wallets add without switching, so retry the switch explicitly.
    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: hexId }],
      });
    } catch (switchErr) {
      log.warn("switch after add failed", target, switchErr);
      throw switchErr;
    }
  }
}

async function addChain(
  provider: Eip1193Provider,
  chain: ChainEntry,
  hexId: string,
  target: Record<string, unknown>,
): Promise<void> {
  try {
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: hexId,
          chainName: chain.chainName,
          nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
          rpcUrls: [chain.rpcUrl],
          // Omit the key rather than send `undefined`: some wallets reject the whole request over it.
          ...(chain.explorerUrl ? { blockExplorerUrls: [chain.explorerUrl] } : {}),
        },
      ],
    });
  } catch (addErr) {
    log.warn("add chain failed", target, addErr);
    throw addErr;
  }
}
