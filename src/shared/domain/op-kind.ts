/// Every shielded operation the app submits; `withdrawEth` pays out native coin via WETH, and
/// `registerName` claims a handle.
export type OpKind = "deposit" | "transfer" | "withdraw" | "withdrawEth" | "swap" | "registerName";

/// The operations whose relayer fee the shared fee panel prices; `withdrawEth` is priced as a
/// withdraw, and a registration shows its own quote.
export type FeeKind = Exclude<OpKind, "withdrawEth" | "registerName">;

/// The leg a per-asset protocol rate is charged on: into the pool, or out of it.
export type FeeLeg = "deposit" | "withdraw";
