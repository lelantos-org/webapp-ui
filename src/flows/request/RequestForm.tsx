import { useEffect } from "react";
import { useForm } from "react-hook-form";
import {
  DEFAULT_ASSET_ID,
  findAsset,
  useAssetSelectOptions,
  useRegisteredAssets,
} from "@/features/assets";
import { useActiveChain } from "@/features/chain";
import {
  AmountHero,
  AssetSelectPill,
  MemoField,
  parseAmountSafe,
  validateAmount,
} from "@/features/op-form";
import { useWalletInstance } from "@/features/wallet";
import { preloadQrCode } from "@/shared/ui/QrCode";
import { ScreenHeader } from "@/shared/ui/ScreenHeader";
import { RequestLink } from "./components/RequestLink";
import { requestLink } from "./request-link";
import "./RequestForm.css";

interface RequestInput {
  amount: string;
  asset: string;
  memo: string;
}

/// Request a payment: an amount, an asset and a memo, turned into a link that opens Send filled in.
/// Nothing is sent or stored; the link is rebuilt as the fields change.
export function RequestForm() {
  const wallet = useWalletInstance();
  const chain = useActiveChain();
  const assets = useRegisteredAssets();
  const options = useAssetSelectOptions({ rateTag: false });
  const { register, watch, setValue } = useForm<RequestInput>({
    defaultValues: { amount: "", asset: DEFAULT_ASSET_ID, memo: "" },
  });

  // The code is the page's output: have its encoder in hand before the first valid amount.
  useEffect(() => void preloadQrCode(), []);

  const [amountText, assetId, memoText] = watch(["amount", "asset", "memo"]);
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
    memoText,
  });

  return (
    <>
      <ScreenHeader
        title="Request a payment"
        subtitle="A link that opens Send with your shielded address, the asset, the amount and any memo filled in."
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
        <MemoField
          inputProps={register("memo")}
          label="Memo (optional)"
          value={memoText}
          helper="Filled into the payer's form, where they can change it. Anyone holding the link can read it."
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
