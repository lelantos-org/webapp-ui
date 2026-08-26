// Prominent entry point for multi-token Permit2 setup.
//
// Lives in the Portfolio card rather than the header's inline action row: the
// header link was easy to miss, and this is the one thing standing between a
// freshly connected wallet and a deposit that needs no per-tx signature.
// Renders nothing at all once every token is authorized.

import { supportsAllowanceBatch } from "@lelantos-org/sdk";
import { useMemo, useState } from "react";
import { useRegisteredAssets } from "@/features/assets";
import { useWallet } from "@/features/wallet";
import { Notice } from "@/shared/ui/Notice";
import { SetupAllModal } from "./SetupAllModal";
import { evaluateSetupMany, useSetupStatusMany } from "./use-setup-status";

export function SetupAllNotice() {
  const assets = useRegisteredAssets();
  const { wallet } = useWallet();
  const [open, setOpen] = useState(false);

  const supported = !!wallet && supportsAllowanceBatch(wallet.chain);
  // Probing is per (chain, payer, asset) with a 30s staleTime and shares its
  // cache with the deposit form's single-asset probe, so this does not add a
  // read the form was not going to make anyway.
  const ids = useMemo(() => (supported ? assets.map((a) => a.id) : []), [supported, assets]);
  const { statuses } = useSetupStatusMany(ids);
  const needs = useMemo(() => evaluateSetupMany(statuses), [statuses]);

  const outstanding = assets.filter((a) => needs.get(a.id)?.needsSetup === true);

  // Silent until the probes have actually said something. A notice that
  // appears and then vanishes on load is worse than one that appears late.
  if (!supported || outstanding.length === 0) return null;

  const names =
    outstanding.length <= 3
      ? outstanding.map((a) => a.symbol).join(", ")
      : `${outstanding
          .slice(0, 3)
          .map((a) => a.symbol)
          .join(", ")} +${outstanding.length - 3} more`;

  return (
    <>
      <Notice
        title={`${outstanding.length} token${outstanding.length === 1 ? "" : "s"} need setup`}
        actionLabel="set up"
        onAction={() => setOpen(true)}
      >
        {`Authorize ${names} once and deposits stop needing a signature each time. One signature covers all of them.`}
      </Notice>
      {open ? <SetupAllModal onClose={() => setOpen(false)} /> : null}
    </>
  );
}
