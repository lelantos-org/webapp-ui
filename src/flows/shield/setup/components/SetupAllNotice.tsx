import { useMemo, useState } from "react";
import { useRegisteredAssets } from "@/features/assets";
import { useWalletInstance } from "@/features/wallet";
import { Notice } from "@/shared/ui/Notice";
import { WideNarrow } from "@/shared/ui/WideNarrow";
import { tokenKey } from "../by-token";
import { type SetupCurrentAsset, setupAllCopy } from "../setup-copy";
import { useSetupNeedsByToken } from "../use-setup-status";
import { SetupAllModal } from "./SetupAllModal";
import { SetupTile } from "./SetupNotice";

export interface SetupAllNoticeProps {
  /// The selected asset, when its own deposit needs no setup.
  current?: SetupCurrentAsset | undefined;
}

/// The card offering multi-token Permit2 setup; renders nothing once every token is set up.
export function SetupAllNotice({ current }: SetupAllNoticeProps) {
  const assets = useRegisteredAssets();
  const wallet = useWalletInstance();
  const [open, setOpen] = useState(false);

  const supported = !!wallet && wallet.capabilities.depositAllowance;
  const probed = useMemo(() => (supported ? assets : []), [supported, assets]);
  const { needs } = useSetupNeedsByToken(probed);

  const names = [
    ...new Set(
      assets
        .filter((a) => needs.get(tokenKey(a))?.needsSetup === true && a.symbol !== current?.symbol)
        .map((a) => a.symbol),
    ),
  ];

  if (!supported || names.length === 0) return null;

  const copy = setupAllCopy(names, current);
  return (
    <>
      <Notice
        tone="accent"
        icon={<SetupTile />}
        title={<WideNarrow wide={copy.title} narrow={copy.short} />}
        actionLabel="Set up"
        onAction={() => setOpen(true)}
        announce={false}
      >
        {copy.body}
      </Notice>
      {open ? <SetupAllModal onClose={() => setOpen(false)} /> : null}
    </>
  );
}
