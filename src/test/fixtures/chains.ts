// Chain registry fixtures.

import { type EvmAddress, evmAddress } from "@lelantos-org/sdk";
import type { ChainEntry } from "@/config/chains";

const PLACEHOLDER: EvmAddress = evmAddress("0x0000000000000000000000000000000000000001");

/// A complete local chain entry: anvil's id and RPC, placeholder contracts, no
/// optional contracts (no Permit2, native adapter or swap wrapper), no explorer
/// and no registered tokens.
///
/// Every field is present so code under test reads what a parsed registry would
/// give it rather than `undefined` from a partial cast.
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
