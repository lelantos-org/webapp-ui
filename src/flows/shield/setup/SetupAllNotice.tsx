// Entry point for multi-token Permit2 setup: the accent card under the Shield
// form.
//
// On the Shield screen rather than Home, because this is where the setup is
// wanted: it stands between a token and a shield that takes a single wallet
// confirmation. It is not a gate there — the selected asset's own setup, when
// it has one, is `SetupNotice` — so the copy says whether this deposit needs it.
// Renders nothing once every token is authorized.

import { supportsAllowanceBatch } from "@lelantos-org/sdk";
import { useMemo, useState } from "react";
import { useRegisteredAssets } from "@/features/assets";
import { useWalletInstance } from "@/features/wallet";
import { Notice } from "@/shared/ui/Notice";
import { tokenKey } from "./by-token";
import { SetupAllModal } from "./SetupAllModal";
import { SetupTile } from "./SetupNotice";
import { type SetupCurrentAsset, setupAllCopy } from "./setup-all-copy";
import { useSetupNeedsByToken } from "./use-setup-status";

export interface SetupAllNoticeProps {
  /// The asset the Shield form has selected, when its own deposit needs no
  /// setup, so the card can say so: native coin never goes through Permit2, and
  /// an approved token is already done. Omit when that is not known.
  current?: SetupCurrentAsset | undefined;
}

export function SetupAllNotice({ current }: SetupAllNoticeProps) {
  const assets = useRegisteredAssets();
  const wallet = useWalletInstance();
  const [open, setOpen] = useState(false);

  const supported = !!wallet && supportsAllowanceBatch(wallet.chain);
  // Probing is per (chain, payer, token) with a 30s staleTime and shares a cache
  // with the deposit form's single-asset probe, so this adds no extra reads.
  const probed = useMemo(() => (supported ? assets : []), [supported, assets]);
  const { needs } = useSetupNeedsByToken(probed);

  // By symbol: a plain and a yield-bound registration of one token share the
  // allowance, and naming it twice would count one setup as two.
  const names = [
    ...new Set(
      assets
        .filter((a) => needs.get(tokenKey(a))?.needsSetup === true && a.symbol !== current?.symbol)
        .map((a) => a.symbol),
    ),
  ];

  // Silent until the probes have answered, so the card does not appear and then
  // vanish during load.
  if (!supported || names.length === 0) return null;

  const copy = setupAllCopy(names, current);
  return (
    <>
      <Notice
        tone="accent"
        icon={<SetupTile />}
        title={
          <>
            <span className="only-wide">{copy.title}</span>
            <span className="only-narrow">{copy.short}</span>
          </>
        }
        actionLabel="Set up"
        onAction={() => setOpen(true)}
        announce={false}
        className="setup-card"
      >
        {copy.body}
      </Notice>
      {open ? <SetupAllModal onClose={() => setOpen(false)} /> : null}
    </>
  );
}
