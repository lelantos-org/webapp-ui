// Single owner for a short-lived wallet's scanner workers.
//
// A `WalletApi` holds a pool of workers, each with its own jubjub wasm
// instance, and `scanner.ts` is explicit that nothing but `releaseScanner`
// frees them — a wallet going out of scope does not. For the main wallet that
// ownership lives in `build-pool`; this is the equivalent for the claim flow's
// ephemeral wallet, whose lifetime is one page visit.
//
// It exists because the disposal was previously spread across four sites — a
// mirror ref, an unmount cleanup, a branch for scans landing after unmount, and
// a `finally` in the sweep — and each one had to independently decide whether
// it was the last reference. Two of them were wrong at different times. One
// owner, one rule: whatever it currently holds is released when it is replaced,
// released explicitly, or unmounted.

import type { WalletApi } from "@lelantos-org/sdk/wallet";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { releaseScanner } from "@/features/wallet/scanner";

export interface ScannerOwner {
  /// Take ownership, releasing anything previously held.
  hold(wallet: WalletApi): void;
  /// Release what is held, if anything. Idempotent.
  release(): void;
  /// Release a wallet this owner never took — for work that completed after
  /// the component went away, where `hold` would only leak it again.
  discard(wallet: WalletApi | undefined): void;
}

export function useScannerOwner(): ScannerOwner {
  const held = useRef<WalletApi | undefined>(undefined);

  const release = useCallback(() => {
    // Guarded rather than relying on `releaseScanner` ignoring `undefined`:
    // "release when nothing is held" should be a no-op here, so the unmount
    // backstop after an explicit release does not read as a double free.
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

  // Unmount is the backstop: whatever is still held has no other reference.
  useEffect(() => release, [release]);

  return useMemo(() => ({ hold, release, discard }), [hold, release, discard]);
}
