// The "You pay" leg of the swap: the amount against the shielded balance and the
// asset it is in, as one panel over "You receive".

import type { ComponentProps, ReactNode } from "react";
import { AmountHero } from "@/features/op-form";
import "../swap.css";

export interface PayLegProps {
  /// `AmountHero`'s share, from `spendHeroProps`.
  hero: Omit<ComponentProps<typeof AmountHero>, "label" | "asset" | "size" | "hint">;
  /// The in-asset trigger, beside the figure.
  picker: ReactNode;
  /// The pair error, said once under this leg rather than under both.
  pairError: string | undefined;
}

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
