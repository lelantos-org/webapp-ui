// Compute the on-chain fee + totals for a `(asset, amount)` pair so the
// form can render "you'll pay X / receive Y" before the user submits.
// Cached per (asset, amount, mode) via react-query.

import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@/features/wallet";

export type FeeMode = "deposit" | "withdraw";

export interface FeePreview {
  /// Asset scale × user amount in base units. For deposits this is what
  /// the contract escrows; for withdraws it's the gross unshield amount.
  inAmt: bigint;
  /// Fee in base units (= inAmt × feeBps / 10_000).
  fee: bigint;
  /// User's net cash delta in base units:
  ///   deposit  → `inAmt + fee` (payer is debited, fee added on top)
  ///   withdraw → `inAmt - fee` (recipient is credited, fee deducted)
  total: bigint;
  /// Raw bps fee from `MASP.feeBps()`.
  feeBps: bigint;
  mode: FeeMode;
}

const DEFAULT_MODE: FeeMode = "deposit";

export function useFeePreview(
  asset: bigint | undefined,
  amount: bigint | undefined,
  mode: FeeMode = DEFAULT_MODE,
) {
  const { wallet } = useWallet();
  return useQuery<FeePreview>({
    queryKey: ["fee-preview", mode, asset?.toString() ?? null, amount?.toString() ?? null],
    enabled: !!wallet && asset !== undefined && amount !== undefined && amount > 0n,
    queryFn: async () => {
      if (!wallet || asset === undefined || amount === undefined) {
        throw new Error("not ready");
      }
      const entry = await wallet.chain.fetchAsset(asset);
      const feeBps = await wallet.chain.fetchFeeBps();
      const inAmt = amount * entry.scale;
      const fee = (inAmt * feeBps) / 10000n;
      const total = mode === "deposit" ? inAmt + fee : inAmt - fee;
      return { inAmt, fee, total, feeBps, mode };
    },
    staleTime: 30_000,
  });
}
