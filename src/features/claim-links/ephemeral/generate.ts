// Generating a claim link: a fresh bearer key, its vault record, and the
// transfer that funds it.

import type { CircuitAmount, SpendPhase, TransferResult, WalletApi } from "@lelantos-org/sdk";
import { randomFr } from "@lelantos-org/sdk/primitives";
import { nskHexFromField } from "@/features/wallet-kinds";
import { encodeClaimPayload } from "../link/codec";
import { markClaimLinkBroadcast, rememberClaimLink } from "../vault/store";
import { deriveEphemeralAddress } from "./ephemeral-wallet";

export interface GenerateClaimLinkArgs {
  amount: CircuitAmount;
  /// Required rather than left to the SDK's default: the id is written into the
  /// vault record before the transfer, and a record naming a different asset
  /// from the one that moved misstates what the link is worth.
  asset: bigint;
  /// Asset to pay the relayer in. Defaults to the asset being sent, as for any
  /// transfer; Send by link offers the same "pay the fee in …" switch Send does.
  feeAsset?: bigint;
  /// Stamped into the link so the claimer knows which pool holds the notes.
  chainId: bigint;
  onPhase?: (phase: SpendPhase) => void;
  /// Last-moment check that the wallet is still on `chainId`.
  ///
  /// Read immediately before the transfer rather than at render: the caller's
  /// `useActiveChain()` is seconds stale by the time proving finishes, and a
  /// `chainChanged` in that window would stamp the link with one chain for a
  /// transfer that landed on another. The claimer would then scan the wrong pool
  /// and be told there is nothing to claim.
  currentChainId?: () => bigint | undefined;
}

export interface GenerateClaimLinkResult {
  url: string;
  /// Alias for `tx.txHash`.
  txHash: string;
  /// Full SDK transfer receipt: own commitments, amount and change.
  tx: TransferResult;
  nskEphHex: string;
  ephAddress: string;
  /// Correlation handle into `vault/store` for the record written before the
  /// broadcast. Dropping a record is the vault screen's responsibility, behind an
  /// explicit confirmation, so this is not a delete token.
  recordId: string;
}

export async function generateClaimLink(
  senderWallet: WalletApi,
  args: GenerateClaimLinkArgs,
): Promise<GenerateClaimLinkResult> {
  const nskEph = randomFr();
  const ephAddress = await deriveEphemeralAddress(nskEph);
  const nskEphHex = nskHexFromField(nskEph);
  const url = `${window.location.origin}/claim#${encodeClaimPayload(args.chainId, nskEphHex)}`;

  // Persisted before the broadcast: afterwards the only copy of this key would
  // be React state, which any chain or account switch discards once the funds
  // have moved. See `vault/store`.
  const recordId = rememberClaimLink({
    url,
    chainId: args.chainId,
    assetId: args.asset,
    amount: args.amount,
  });

  const stillHere = args.currentChainId?.();
  if (stillHere !== undefined && stillHere !== args.chainId) {
    throw new Error(
      `wallet switched to chain ${stillHere} while preparing a link for chain ${args.chainId}`,
    );
  }

  const tx = await senderWallet.transfer({
    recipient: ephAddress,
    amount: args.amount,
    asset: args.asset,
    feeAsset: args.feeAsset,
    autoConsolidate: true,
    onPhase: args.onPhase,
  });

  markClaimLinkBroadcast(recordId, tx.txHash);
  return { url, txHash: tx.txHash, tx, nskEphHex, ephAddress, recordId };
}
