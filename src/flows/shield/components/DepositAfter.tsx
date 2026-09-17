import type { RegisteredAsset } from "@/config/chains";
import { SetupAllNotice } from "../setup/components/SetupAllNotice";
import { SetupNotice } from "../setup/components/SetupNotice";
import type { DepositSetup } from "../use-deposit-setup";
import "./DepositAfter.css";

interface DepositAfterProps {
  selected: RegisteredAsset | undefined;
  symbol: string | undefined;
  asEth: boolean;
  setup: DepositSetup;
}

/// Under Shield's card: the setup prompt or offer, and the page's closing line.
export function DepositAfter({ selected, symbol, asEth, setup }: DepositAfterProps) {
  const needsSetup = setup.applicable && (setup.needs.needsSetup || setup.unknown);
  return (
    <>
      {needsSetup && selected ? (
        <SetupNotice
          assets={setup.assets}
          willApproveErc20={setup.assets.some(setup.willApproveErc20)}
          unknown={setup.unknown}
          onRun={setup.show}
        />
      ) : (
        <SetupAllNotice
          current={
            symbol && (!setup.applicable || (!setup.blocked && !setup.needs.needsSetup))
              ? { symbol, native: asEth }
              : undefined
          }
        />
      )}
      <p className="footnote screen-note">
        Once shielded, your balance and every transfer are private.
      </p>
    </>
  );
}
