import type { ReactNode } from "react";
import { usePrivacy } from "@/shared/hooks/use-privacy";
import { MASK } from "@/shared/lib/format/text";

/// A figure of what the wallet holds. Privacy mode swaps it for a mask of fixed width, so the
/// mask's length says nothing about the figure's.
export function Masked({ children }: { children: ReactNode }) {
  const { hidden } = usePrivacy();
  if (!hidden) return <>{children}</>;
  return (
    <>
      <span aria-hidden="true">{MASK}</span>
      <span className="sr-only">hidden</span>
    </>
  );
}
