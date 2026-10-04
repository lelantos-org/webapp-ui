// Creating and topping up an agent wallet: an ephemeral shielded wallet whose key
// is handed to a process and whose record outlives the funding.
//
// The record is written before the transfer: once funds move, React state must
// not hold the only copy of the key.

import type { CircuitAmount, SpendPhase, TransferResult, WalletApi } from "@lelantos-org/sdk";
import { randomFr } from "@lelantos-org/sdk/primitives";
import { deriveEphemeralAddress } from "@/features/claim-links";
import { nskHexFromField } from "@/features/wallet-kinds";
import type { RelayerFeeTerms } from "@/shared/domain/relayer-fee";
import { forgetAgent, rememberAgent } from "./store";

export interface FundAgentArgs extends RelayerFeeTerms {
  label: string;
  amount: CircuitAmount;
  /// Required: the record is written before the transfer and must name the asset that moves.
  asset: bigint;
  /// Stamped into the record so the agent knows which pool holds its notes.
  chainId: bigint;
  onPhase?: (phase: SpendPhase) => void;
  /// Read right before the transfer, so a chain switch mid-proof cannot mislabel the agent.
  currentChainId?: () => bigint | undefined;
}

export interface FundAgentResult {
  /// The vault record written before the broadcast.
  recordId: string;
  address: string;
  nskHex: string;
  txHash: string;
  tx: TransferResult;
}

export async function createAgent(
  funder: WalletApi,
  args: FundAgentArgs,
): Promise<FundAgentResult> {
  const nsk = randomFr();
  const address = await deriveEphemeralAddress(nsk);
  const nskHex = nskHexFromField(nsk);

  const recordId = rememberAgent({
    label: args.label,
    chainId: args.chainId,
    address,
    nsk: nskHex,
  });

  // The record is dropped only if the spend never reached the relayer. Past that point the
  // transfer may land, and the record holds the only copy of the key.
  let handedToRelayer = false;
  try {
    const tx = await send(funder, address, {
      ...args,
      onPhase: (phase) => {
        if (phase === "submitting" || phase === "confirmed") handedToRelayer = true;
        args.onPhase?.(phase);
      },
    });
    return { recordId, address, nskHex, txHash: tx.txHash, tx };
  } catch (e) {
    if (!handedToRelayer) forgetAgent(recordId);
    throw e;
  }
}

export interface TopUpAgentArgs extends Omit<FundAgentArgs, "label"> {
  /// The agent's shielded address, from its stored record.
  address: string;
}

/// Send more to an agent that already exists. No key is minted; the record is unchanged.
export async function topUpAgent(
  funder: WalletApi,
  args: TopUpAgentArgs,
): Promise<{ txHash: string; tx: TransferResult }> {
  const tx = await send(funder, args.address, args);
  return { txHash: tx.txHash, tx };
}

async function send(
  funder: WalletApi,
  recipient: string,
  args: FundAgentArgs | TopUpAgentArgs,
): Promise<TransferResult> {
  const stillHere = args.currentChainId?.();
  if (stillHere !== undefined && stillHere !== args.chainId) {
    throw new Error(
      `wallet switched to chain ${stillHere} while funding an agent on chain ${args.chainId}`,
    );
  }

  return funder.transfer({
    recipient,
    amount: args.amount,
    asset: args.asset,
    feeAsset: args.feeAsset,
    maxFee: args.maxFee,
    autoConsolidate: true,
    onPhase: args.onPhase,
  });
}
