import { useCallback, useMemo, useState } from "react";
import { eip1193Store, selectKind } from "@/features/wallet-kinds";
import { useStore } from "@/shared/lib/external-store";
import { offerings, type WalletChoice } from "./wallet-offerings";

export interface ConnectFlow {
  /// The wallets to choose between, snapshotted when the picker opened; `null` while closed.
  choices: WalletChoice[] | null;
  begin(): void;
  choose(choice: WalletChoice): void;
  cancel(): void;
}

export function useConnectFlow(): ConnectFlow {
  const [choices, setChoices] = useState<WalletChoice[] | null>(null);

  const begin = useCallback(() => {
    eip1193Store.startDiscovery();
    const discovered = eip1193Store.getState().discovered;
    const offered = offerings(discovered);
    if (offered.length > 1) {
      setChoices(offered);
      return;
    }
    // With zero or one row a picker adds a click without adding information.
    selectKind(offered[0]?.kind ?? "eip1193");
  }, []);

  const choose = useCallback((choice: WalletChoice) => {
    setChoices(null);
    selectKind(choice.kind, choice.id);
  }, []);

  const cancel = useCallback(() => setChoices(null), []);

  return { choices, begin, choose, cancel };
}

/// The rows the picker would offer, live (for Welcome's inline card).
export function useWalletChoices(): WalletChoice[] {
  const discovered = useStore(eip1193Store, (s) => s.discovered);
  return useMemo(() => offerings(discovered), [discovered]);
}
