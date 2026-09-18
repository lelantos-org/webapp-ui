// Creating and topping up an agent wallet.
//
// An agent wallet is an ephemeral shielded wallet whose key the agent holds
// rather than a human claiming it once. The mechanics are the claim-link ones —
// mint a key, derive its address, send it funds — so the ephemeral wallet
// machinery is shared; what differs is that the key is handed to a process, the
// wallet is topped up rather than swept on first use, and the record outlives
// the funding.
//
// The record is written **before** the transfer, for the same reason it is on the
// claim-link path: once funds move, React state holding the only copy of the key
// is one remount away from losing them.

import type { CircuitAmount, SpendPhase, TransferResult, WalletApi } from "@lelantos-org/sdk";
import { randomFr } from "@lelantos-org/sdk/primitives";
import { deriveEphemeralAddress } from "@/features/claim-links";
import { nskHexFromField } from "@/features/wallet-kinds";
import { rememberAgent } from "./store";

export interface FundAgentArgs {
  label: string;
  amount: CircuitAmount;
  /// Required: the record is written before the transfer and must name the asset that moves.
  asset: bigint;
  /// Asset to pay the relayer in; defaults to `asset`.
  feeAsset?: bigint;
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

  const tx = await send(funder, address, args);
  return { recordId, address, nskHex, txHash: tx.txHash, tx };
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

/// Marking an agent revoked is the store's job; the sweep itself is in `use-agent-wallet`.

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
    autoConsolidate: true,
    onPhase: args.onPhase,
  });
}
