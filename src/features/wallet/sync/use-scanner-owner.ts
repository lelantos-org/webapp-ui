// Single owner for a short-lived wallet's scanner workers.
//
// A `WalletApi` holds a pool of workers, each with its own jubjub wasm instance,
// and only `releaseScanner` frees them (see `scanner.ts`); a wallet going out of
// scope does not. `build-pool` owns that for the main wallet; this is the
// equivalent for the claim flow's ephemeral wallet, whose lifetime is one page
// visit.
//
// Disposal is centralised here so no call site has to decide whether it holds
// the last reference. One rule applies: whatever is held is released when it is
// replaced, released explicitly, or unmounted.

import type { WalletApi } from "@lelantos-org/sdk/wallet";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { releaseScanner } from "./scanner";

export interface ScannerOwner {
  /// Take ownership, releasing anything previously held.
  hold(wallet: WalletApi): void;
  /// Release what is held, if anything. Idempotent.
  release(): void;
  /// Release a wallet this owner never took, for work completing after the
  /// component unmounted, where `hold` would leak it.
  discard(wallet: WalletApi | undefined): void;
}

export function useScannerOwner(): ScannerOwner {
  const held = useRef<WalletApi | undefined>(undefined);

  const release = useCallback(() => {
    // Guarded rather than relying on `releaseScanner` ignoring `undefined`, so
    // releasing with nothing held is a no-op and the unmount backstop after an
    // explicit release does not read as a double free.
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

  // Unmount is the backstop, since anything still held has no other reference.
  useEffect(() => release, [release]);

  return useMemo(() => ({ hold, release, discard }), [hold, release, discard]);
}
