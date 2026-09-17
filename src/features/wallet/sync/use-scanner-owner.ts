import type { WalletApi } from "@lelantos-org/sdk";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { releaseScanner } from "./scanner";

export interface ScannerOwner {
  /// Take ownership, releasing anything previously held.
  hold(wallet: WalletApi): void;
  /// Release what is held, if anything. Idempotent.
  release(): void;
  /// Release a wallet this owner never took (work finishing after unmount).
  discard(wallet: WalletApi | undefined): void;
}

export function useScannerOwner(): ScannerOwner {
  const held = useRef<WalletApi | undefined>(undefined);

  const release = useCallback(() => {
    if (!held.current) return;
    releaseScanner(held.current);
    held.current = undefined;
  }, []);

  const hold = useCallback((wallet: WalletApi) => {
    if (held.current && held.current !== wallet) releaseScanner(held.current);
    held.current = wallet;
  }, []);

  const discard = useCallback((wallet: WalletApi | undefined) => {
    if (wallet && wallet !== held.current) releaseScanner(wallet);
  }, []);

  useEffect(() => release, [release]);

  return useMemo(() => ({ hold, release, discard }), [hold, release, discard]);
}
