// What this wallet may do, as the UI needs to ask it.
//
// The SDK owns the truth: `wallet.capabilities` is fixed at `connect()` from the
// chain layer it was built with. This module turns those flags into something
// React can render — a boolean plus a sentence to show the user — so no
// component re-derives or rewords them.
//
// Gating happens *before* the action, not at submit. A disabled tab with an
// explanation is a different thing from a form that throws once the user has
// filled it in, and only a predicate can express the former.

import type { WalletApi } from "@lelantos-org/sdk";
import { kindAdapter, type WalletKind } from "@/features/wallet-kinds";

/// The actions that are not available to every wallet.
///
/// Deliberately short. Transfer, withdraw, `withdrawEth`, swap and claim links
/// are absent because they work from any wallet: each proves ownership in the
/// circuit and hands the proof to the relayer, which broadcasts it and pays the
/// gas. Depositing is the one operation that moves public tokens out of an EVM
/// account, and everything here follows from that.
///
/// Two, not four. The Permit2 setup flow and cancelling an escrow are gated by
/// the same signing key as `deposit` and can never disagree with it — naming
/// them separately would only imply an independence they do not have.
export type Capability = "deposit" | "depositEth";

export interface CapabilityVerdict {
  allowed: boolean;
  /// Shown verbatim in the disabled panel. Present only when `!allowed`.
  reason?: string;
}

export type WalletCapabilities = Readonly<Record<Capability, CapabilityVerdict>>;

const DISCONNECTED_REASON = "Connect a wallet first.";

const ALLOWED: CapabilityVerdict = { allowed: true };

function denied(reason: string): CapabilityVerdict {
  return { allowed: false, reason };
}

function all(v: CapabilityVerdict): WalletCapabilities {
  return { deposit: v, depositEth: v };
}

/// Derive the capability record for a wallet.
///
/// Pure, so it is testable against a fake `WalletApi` and memoisable in the
/// provider — no component recomputes it.
export function deriveCapabilities(
  wallet: WalletApi | undefined,
  kind: WalletKind | undefined,
): WalletCapabilities {
  if (!wallet) return all(denied(DISCONNECTED_REASON));

  // The flag decides, on its own. Depositing needs a chain layer that signs,
  // and that is a property of the wallet rather than of its kind — so a future
  // passkey paired with a signer is allowed here without this file changing.
  // The kind only selects the wording.
  // The wording travels with the kind (`KindCopy.noDepositReason`), so a third
  // wallet kind writes its own sentence in its own adapter and this file does
  // not change.
  if (!wallet.capabilities.deposit) {
    return all(denied(kind ? kindAdapter(kind).copy.noDepositReason : DISCONNECTED_REASON));
  }

  return {
    deposit: ALLOWED,
    // Native-ETH deposits additionally need a `NativeAdapter` deployed on this
    // chain. Unlike the rest, this is a property of the deployment rather than
    // of the wallet, and the asset picker already withholds the option — so the
    // reason names the chain, not the wallet.
    depositEth: wallet.capabilities.nativeDeposit
      ? ALLOWED
      : denied("This network has no native-ETH entry point, so ETH must be wrapped first."),
  };
}
