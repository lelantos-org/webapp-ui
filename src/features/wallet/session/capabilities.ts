import type { WalletApi } from "@lelantos-org/sdk";
import type { ChainEntry } from "@/config/chains";
import { kindAdapter, type WalletKind } from "@/features/wallet-kinds";

/// The actions not every wallet may take; spends are relayed proofs and never gated.
export type Capability = "deposit" | "depositEth" | "govern";

export interface CapabilityVerdict {
  allowed: boolean;
  /// Shown verbatim in the disabled panel; present only when `!allowed`.
  reason?: string;
}

export type WalletCapabilities = Readonly<Record<Capability, CapabilityVerdict>>;

const DISCONNECTED_REASON = "Connect a wallet first.";

const ALLOWED: CapabilityVerdict = { allowed: true };

function denied(reason: string): CapabilityVerdict {
  return { allowed: false, reason };
}

function all(v: CapabilityVerdict): WalletCapabilities {
  return { deposit: v, depositEth: v, govern: v };
}

const NO_GOVERNANCE_REASON = "This network runs no on-chain governance.";

const NO_SIGNER_GOVERN_REASON =
  "Voting, delegating and proposing are transactions from a public account. Connect a browser wallet to take part; proposals stay readable here.";

/// Derive the capability record for a wallet.
export function deriveCapabilities(
  wallet: WalletApi | undefined,
  kind: WalletKind | undefined,
  context: {
    ethAddress?: string | undefined;
    chain?: Pick<ChainEntry, "governorAddress"> | undefined;
  } = {},
): WalletCapabilities {
  if (!wallet) return all(denied(DISCONNECTED_REASON));

  const govern = context.chain?.governorAddress
    ? wallet.capabilities.deposit && context.ethAddress
      ? ALLOWED
      : denied(NO_SIGNER_GOVERN_REASON)
    : denied(NO_GOVERNANCE_REASON);

  // The signing flag decides, not the kind; the kind only supplies the wording.
  if (!wallet.capabilities.deposit) {
    const deposit = denied(kind ? kindAdapter(kind).copy.noDepositReason : DISCONNECTED_REASON);
    return { deposit, depositEth: deposit, govern };
  }

  return {
    deposit: ALLOWED,
    depositEth: wallet.capabilities.nativeDeposit
      ? ALLOWED
      : denied("This network has no native-ETH entry point, so ETH must be wrapped first."),
    govern,
  };
}
