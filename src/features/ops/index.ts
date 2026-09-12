// Public surface of the `ops` feature: the runtime every shielded op runs on.
//
// The SDK adapter the mutation hooks call through (`sdk-adapter.ts`), the
// post-submit tracker that drives the pending overlay and the lifecycle, and the
// policy the mutation hooks share (`mutation.ts`). The hooks themselves — one per
// op — live with the flow that runs them under `src/flows`, which is also why
// nothing here imports a flow or the form kit.

export type { ActionMutation } from "./mutation";
export { trackPostSubmit, useSpendMutation, useTrackedMutation } from "./mutation";
export type {
  DepositCall,
  GenerateLinkCall,
  SwapCall,
  TransferCall,
  WithdrawCall,
} from "./sdk-adapter";
export { swapCredit } from "./swap-credit";
export { useTxTracker } from "./use-tx-tracker";
