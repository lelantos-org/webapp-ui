import { type EvmAddress, evmAddress } from "@lelantos-org/sdk";
import type { ChainEntry } from "@/config/chains";

const PLACEHOLDER: EvmAddress = evmAddress("0x0000000000000000000000000000000000000001");

/// A complete anvil chain entry: placeholder contracts, no optional contracts, explorer or tokens.
export function makeChain(over: Partial<ChainEntry> = {}): ChainEntry {
  return {
    chainId: 31337n,
    chainName: "anvil",
    rpcUrl: "http://localhost:8545",
    readRpcUrl: "http://localhost:8545",
    maspAddress: PLACEHOLDER,
    relayerAddress: PLACEHOLDER,
    treeDepth: 20,
    tokens: [],
    ...over,
  };
}
