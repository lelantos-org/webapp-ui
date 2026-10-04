import type { CircuitAmount } from "@lelantos-org/sdk";

/// How a shielded spend pays the relayer.
export interface RelayerFeeTerms {
  /// Asset the fee is paid in, which the relayer must have quoted. Defaults to the asset being moved.
  feeAsset?: bigint | undefined;
  /// The most the relayer may be paid, in circuit units of the fee asset: the fee the user reviewed.
  maxFee?: CircuitAmount | undefined;
}
