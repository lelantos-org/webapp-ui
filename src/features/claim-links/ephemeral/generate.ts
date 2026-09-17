import type { CircuitAmount, SpendPhase, TransferResult, WalletApi } from "@lelantos-org/sdk";
import { randomFr } from "@lelantos-org/sdk/primitives";
import { nskHexFromField } from "@/features/wallet-kinds";
import { encodeClaimPayload } from "../link/codec";
import { markClaimLinkBroadcast, rememberClaimLink } from "../vault/store";
import { deriveEphemeralAddress } from "./ephemeral-wallet";

export interface GenerateClaimLinkArgs {
  amount: CircuitAmount;
  /// Required: the vault record is written before the transfer and must name the asset that moves.
  asset: bigint;
  /// Asset to pay the relayer in; defaults to `asset`.
  feeAsset?: bigint;
  /// Stamped into the link so the claimer knows which pool holds the notes.
  chainId: bigint;
  onPhase?: (phase: SpendPhase) => void;
  /// Read right before the transfer, so a chain switch mid-proof cannot mislabel the link.
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
  /// The vault record written before the broadcast. Not a delete token.
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

  // Persist before broadcasting, or React state would hold the key's only copy once funds move.
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
