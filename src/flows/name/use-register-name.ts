import type { RegisterNameResult } from "@lelantos-org/sdk";
import { useActiveChain } from "@/features/chain";
import { rememberClaimedHandle, useInvalidateNames } from "@/features/names";
import {
  type ActionMutation,
  type RegisterNameCall,
  spendSteps,
  useSpendMutation,
} from "@/features/ops";
import { useWalletInstance } from "@/features/wallet";

/// Claims a handle: one relayed spend that pays the registrar and publishes the account's address.
/// Landing is not registering, so the label names the transaction, not its outcome.
export function useRegisterName(): ActionMutation<RegisterNameCall, RegisterNameResult> {
  const chain = useActiveChain();
  const account = useWalletInstance()?.address;
  const invalidate = useInvalidateNames(chain);
  return useSpendMutation<RegisterNameCall, RegisterNameResult>({
    key: "register-name",
    label: () => "handle transaction",
    run: (a, i, progress) => {
      progress.start(spendSteps("registerName"));
      return a.registerName({ ...i, onPhase: progress.set });
    },
    track: (_i, result) => ({ kind: "registerName", result }),
    onSuccess: (result) => {
      void invalidate();
      if (result.registered && account) rememberClaimedHandle(chain.chainId, account, result);
    },
  });
}
