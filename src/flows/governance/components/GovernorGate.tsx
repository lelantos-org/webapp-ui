import type { ReactNode } from "react";
import { useActiveChain } from "@/features/chain";
import { useGovernance } from "@/features/governance";
import { Notice } from "@/shared/ui/Notice";
import { ScreenHeader } from "@/shared/ui/ScreenHeader";

/// Renders governance screens only where the active chain runs a governor.
export function GovernorGate({ children }: { children: ReactNode }) {
  const { governor } = useGovernance();
  const chain = useActiveChain();
  if (governor) return <>{children}</>;
  return (
    <>
      <ScreenHeader title="Governance" />
      <Notice tone="neutral" title="No governance on this network">
        {chain.chainName} has no governor registered, so there is nothing to vote on here.
      </Notice>
    </>
  );
}
