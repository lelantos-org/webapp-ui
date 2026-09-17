import type { ComponentProps, ReactNode } from "react";
import { AmountHero } from "@/features/op-form";
import "../swap.css";

export interface PayLegProps {
  /// From `spendHeroProps`.
  hero: Omit<ComponentProps<typeof AmountHero>, "label" | "asset" | "size" | "hint">;
  picker: ReactNode;
  pairError: string | undefined;
}

/// The "You pay" leg of the swap.
export function PayLeg({ hero, picker, pairError }: PayLegProps) {
  return (
    <div className="swap-leg swap-leg--pay">
      <AmountHero
        {...hero}
        size="md"
        label="You pay"
        asset={picker}
        hint={pairError ? <span className="swap-pair__err">{pairError}</span> : undefined}
      />
    </div>
  );
}
