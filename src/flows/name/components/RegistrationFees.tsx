import type { AssetSelectOption } from "@/features/assets";
import { AssetSelectPill } from "@/features/op-form";
import type { FeeReading } from "../fees";

export interface RegistrationFeesProps {
  registrarFee: FeeReading;
  /// The relayer's fee as quoted now.
  relayerFee: FeeReading;
  onRetryRegistrarFee(): void;
  /// The asset the registration is paid from, once known.
  symbol: string | undefined;
  /// Set where registration is free: the asset is then the user's to pick.
  paidFrom?:
    | { options: readonly AssetSelectOption[]; value: string; onChange(value: string): void }
    | undefined;
}

/// The two fees of a registration, as quoted now.
export function RegistrationFees({
  registrarFee,
  relayerFee,
  onRetryRegistrarFee,
  symbol,
  paidFrom,
}: RegistrationFeesProps) {
  return (
    <section className="name-fees" aria-label="Fees">
      <dl className="name-fees__rows">
        <div className="name-fees__row">
          <dt>Registrar fee</dt>
          <dd className="mono">
            <RegistrarFee fee={registrarFee} onRetry={onRetryRegistrarFee} />
          </dd>
        </div>
        <div className="name-fees__row">
          <dt>Relayer fee</dt>
          <dd className="mono">
            <RelayerFee fee={relayerFee} />
          </dd>
        </div>
        {paidFrom ? (
          <div className="name-fees__row name-fees__row--pick">
            <dt>Paid from</dt>
            <dd>
              <AssetSelectPill label="Asset to pay from" {...paidFrom} />
            </dd>
          </div>
        ) : null}
      </dl>
      <p className="name-pub__note">
        {symbol
          ? `Both are paid from your shielded ${symbol}`
          : "Both are paid from shielded funds"}
        , with the pool's fee for moving it out. The relayer's fee is its current quote and can move
        before the claim lands; what was paid is shown then. If the handle is taken first, the
        registrar's fee comes back to you and only the other fees are spent.
      </p>
    </section>
  );
}

function RegistrarFee({ fee, onRetry }: { fee: FeeReading; onRetry(): void }) {
  switch (fee.state) {
    case "ready":
      return <>{fee.text}</>;
    case "failed":
      return (
        <button type="button" className="link-btn name-field__retry" onClick={onRetry}>
          Couldn't read it. Try again
        </button>
      );
    case "loading":
      return <span className="name-fees__pending">Reading…</span>;
  }
}

function RelayerFee({ fee }: { fee: FeeReading }) {
  switch (fee.state) {
    case "ready":
      return <>{fee.text}</>;
    case "failed":
      return <>Quoted when you submit</>;
    case "loading":
      return <span className="name-fees__pending">Quoting…</span>;
  }
}
