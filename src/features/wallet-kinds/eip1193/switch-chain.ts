import type { ChainEntry } from "@/config/chains";
import { createLogger } from "@/shared/lib/logger";
import { isUnrecognizedChain, isUnsupportedChain } from "./errors";
import type { Eip1193Provider } from "./provider";

const log = createLogger("eip1193:switch-chain");

/// Move `provider` to `chain`, adding it and retrying on 4902. State follows via `chainChanged`.
/// A wallet with a fixed network list (Phantom) that cannot use `chain` fails naming both.
export async function switchWalletChain(
  provider: Eip1193Provider,
  chain: ChainEntry,
  walletName = "Your wallet",
): Promise<void> {
  const hexId = `0x${chain.chainId.toString(16)}`;
  try {
    await switchOrAdd(provider, chain, hexId);
  } catch (err) {
    if (!isUnsupportedChain(err)) throw err;
    log.warn("wallet does not support chain", { walletName, chainId: hexId }, err);
    throw new Error(
      `${walletName} does not support ${chain.chainName}. Pick another network or wallet.`,
      { cause: err },
    );
  }
}

async function switchOrAdd(
  provider: Eip1193Provider,
  chain: ChainEntry,
  hexId: string,
): Promise<void> {
  const target = { chainId: hexId, chainName: chain.chainName, rpcUrl: chain.rpcUrl };
  try {
    await switchTo(provider, hexId);
    return;
  } catch (err) {
    if (!isUnrecognizedChain(err)) throw err;
    log.warn("chain unknown to the wallet; adding it", target);
  }
  try {
    await addChain(provider, chain, hexId);
  } catch (addErr) {
    log.warn("add chain failed", target, addErr);
    throw addErr;
  }
  // Some wallets add without switching, so retry the switch explicitly.
  try {
    await switchTo(provider, hexId);
  } catch (switchErr) {
    log.warn("switch after add failed", target, switchErr);
    throw switchErr;
  }
}

function switchTo(provider: Eip1193Provider, hexId: string): Promise<unknown> {
  return provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hexId }] });
}

function addChain(provider: Eip1193Provider, chain: ChainEntry, hexId: string): Promise<unknown> {
  return provider.request({
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
}
