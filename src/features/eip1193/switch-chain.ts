// `wallet_switchEthereumChain`, with the add-then-retry fallback.
//
// Pulled out of the store because none of it is state: it is a three-call
// protocol dance against one provider, and the result arrives back through the
// `chainChanged` listener rather than through a return value.

import type { ChainEntry } from "@/config/chains";
import { createLogger } from "@/shared/lib/logger";
import { isUnrecognizedChain } from "./errors";
import type { Eip1193Provider } from "./provider";

const log = createLogger("eip1193:switch-chain");

/// Move `provider` to `chain`.
///
/// On 4902 (chain unknown to the wallet) the chain is added via
/// `wallet_addEthereumChain` and the switch retried. The `chainChanged`
/// listener updates state when the wallet finishes, so callers need no further
/// sync.
///
/// Takes the whole `ChainEntry` rather than an id, because the
/// `wallet_addEthereumChain` fallback must describe the chain being added.
/// Sourcing the name, RPC and explorer from a build-time singleton would
/// register every chain under a single configuration.
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
    // `warn` rather than `debug`: `debug` requires VITE_DEBUG or `?debug=1`,
    // so a user-reported failure would arrive with the fallback invisible.
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
          // Spread rather than an explicit `undefined`: wallets validate this
          // field's type whenever the key is present, and some reject the whole
          // request over it.
          ...(chain.explorerUrl ? { blockExplorerUrls: [chain.explorerUrl] } : {}),
        },
      ],
    });
  } catch (addErr) {
    // The likely faults are indistinguishable from the message alone: the
    // wallet refusing custom networks, an RPC URL unreachable from the browser,
    // or an RPC answering with a different chain id.
    log.warn("add chain failed", target, addErr);
    throw addErr;
  }
}
