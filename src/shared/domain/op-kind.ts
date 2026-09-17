/// Every shielded operation the app submits; `withdrawEth` pays out native coin via WETH.
export type OpKind = "deposit" | "transfer" | "withdraw" | "withdrawEth" | "swap";

/// The operations the relayer quotes; `withdrawEth` is priced as a withdraw.
export type FeeKind = Exclude<OpKind, "withdrawEth">;

/// The leg a per-asset protocol rate is charged on: into the pool, or out of it.
export type FeeLeg = "deposit" | "withdraw";
