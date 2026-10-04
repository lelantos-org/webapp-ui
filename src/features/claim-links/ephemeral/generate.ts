import type { CircuitAmount, SpendPhase, TransferResult, WalletApi } from "@lelantos-org/sdk";
import type { RelayerFeeTerms } from "@/shared/domain/relayer-fee";
import { markClaimLinkBroadcast, rememberClaimLink } from "../vault/store";
import { allocateLink, claimUrl, markLinkFunded, type ProbeLink } from "./seed-links";

export interface GenerateClaimLinkArgs extends RelayerFeeTerms {
  amount: CircuitAmount;
  /// Required: the vault record is written before the transfer and must name the asset that moves.
  asset: bigint;
  /// Stamped into the link so the claimer knows which pool holds the notes.
  chainId: bigint;
  onPhase?: (phase: SpendPhase) => void;
  /// Read right before the transfer, so a chain switch mid-proof cannot mislabel the link.
  currentChainId?: () => bigint | undefined;
  /// Reads a link account's history, so the link takes an index no earlier link was made from.
  probe: ProbeLink;
}

export interface GenerateClaimLinkResult {
  url: string;
  /// Alias for `tx.txHash`.
  txHash: string;
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
  // The key derives from the sender's seed, at an index whose account has never held a note.
  const link = await allocateLink(senderWallet, args.chainId, args.probe);
  const { nskHex: nskEphHex, address: ephAddress } = link;
  const url = claimUrl(window.location.origin, args.chainId, nskEphHex);

  // Persist before broadcasting: the vault is how the sender finds the link again without a scan.
  const recordId = rememberClaimLink({
    url,
    chainId: args.chainId,
    assetId: args.asset,
    amount: args.amount,
    derived: true,
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
    maxFee: args.maxFee,
    autoConsolidate: true,
    onPhase: args.onPhase,
  });

  markClaimLinkBroadcast(recordId, tx.txHash);
  markLinkFunded(senderWallet.address, args.chainId, link.index);
  return { url, txHash: tx.txHash, tx, nskEphHex, ephAddress, recordId };
}
