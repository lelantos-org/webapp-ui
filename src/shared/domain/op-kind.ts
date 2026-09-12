// The operations the app performs, named once.
//
// Several modules switch on an operation — the step list, the pending overlay,
// the fee panel, the relayer quote. One definition means adding an operation is a compile error at
// every switch that does not handle it, rather than a string one of them
// silently never matches.

/// Every shielded operation the app submits. `withdrawEth` is a withdraw paid
/// out as native coin through the pool's WETH bridge.
export type OpKind = "deposit" | "transfer" | "withdraw" | "withdrawEth" | "swap";

/// The operations the relayer quotes and the fee panel prices. `withdrawEth` is
/// not among them: it is priced as the withdraw it is.
export type FeeKind = Exclude<OpKind, "withdrawEth">;

/// The leg a protocol rate is charged on: into the pool, or out of it. Rates are
/// per asset and per leg, so reading one needs to say which.
export type FeeLeg = "deposit" | "withdraw";
