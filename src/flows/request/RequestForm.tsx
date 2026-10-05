import { useEffect } from "react";
import { useForm } from "react-hook-form";
import {
  DEFAULT_ASSET_ID,
  findAsset,
  useAssetSelectOptions,
  useRegisteredAssets,
} from "@/features/assets";
import { useActiveChain } from "@/features/chain";
import { AmountHero, AssetSelectPill, parseAmountSafe, validateAmount } from "@/features/op-form";
import { useWalletInstance } from "@/features/wallet";
import { preloadQrCode } from "@/shared/ui/QrCode";
import { ScreenHeader } from "@/shared/ui/ScreenHeader";
import { RequestLink } from "./components/RequestLink";
import { requestLink } from "./request-link";
import "./RequestForm.css";

interface RequestInput {
  amount: string;
  asset: string;
}

/// Request a payment: an amount and an asset, turned into a link that opens Send filled in.
/// Nothing is sent or stored; the link is rebuilt as the fields change.
export function RequestForm() {
  const wallet = useWalletInstance();
  const chain = useActiveChain();
  const assets = useRegisteredAssets();
  const options = useAssetSelectOptions({ rateTag: false });
  const { register, watch, setValue } = useForm<RequestInput>({
    defaultValues: { amount: "", asset: DEFAULT_ASSET_ID },
  });

  // The code is the page's output: have its encoder in hand before the first valid amount.
  useEffect(() => void preloadQrCode(), []);

  const [amountText, assetId] = watch(["amount", "asset"]);
  const selected = findAsset(assets, assetId);
  const parsed = parseAmountSafe(amountText, selected);
  // No balance: what is asked for is not bounded by what the requester holds.
  const validation = validateAmount(parsed, selected, undefined);
  const link = requestLink({
    origin: window.location.origin,
    chainId: chain.chainId,
    address: wallet?.address,
    hasAssets: assets.length > 0,
    selected,
    amountText,
    parsed,
    amountValid: validation.valid,
  });

  return (
    <>
      <ScreenHeader
        title="Request a payment"
        subtitle="A link that opens Send with your shielded address, the asset and the amount filled in."
      />
      <div className="surface surface--card screen-card">
        <AmountHero
          inputProps={register("amount")}
          label="You request"
          selected={selected}
          value={amountText}
          amount={parsed}
          maxAmount={undefined}
          onSetMax={() => {}}
          validation={validation}
          warmProver={false}
          asset={
            <AssetSelectPill
              label="Asset"
              options={options}
              value={assetId}
              onChange={(next) => setValue("asset", next)}
            />
          }
        />
        <hr className="rule" />
        {link.url !== undefined ? (
          <RequestLink url={link.url} amountLabel={link.amountLabel} chainName={chain.chainName} />
        ) : (
          <p className="reqlink-empty">{link.reason ?? "Your link appears here."}</p>
        )}
      </div>
      <p className="footnote">
        Nothing in the link is secret, and it cannot move funds. Whoever opens it reviews and
        confirms the payment in their own wallet.
      </p>
    </>
  );
}
