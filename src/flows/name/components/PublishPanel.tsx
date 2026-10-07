import { AddressSummary } from "@/shared/ui/address/AddressSummary";
import { CheckGlyph } from "@/shared/ui/icons/glyphs";
import { Notice } from "@/shared/ui/Notice";

export interface PublishPanelProps {
  /// The handle as it will be shown; `undefined` until a valid one is typed.
  name: string | undefined;
  /// The address the wallet publishes; `undefined` while it is derived.
  address: string | undefined;
  addressFailed: boolean;
  onRetryAddress(): void;
  acknowledged: boolean;
  onAcknowledge(checked: boolean): void;
}

/// What a registration makes public: the address by its fingerprint, the warning, and the confirmation.
export function PublishPanel({
  name,
  address,
  addressFailed,
  onRetryAddress,
  acknowledged,
  onAcknowledge,
}: PublishPanelProps) {
  const subject = name ?? "your handle";
  return (
    <>
      <section className="name-pub" aria-label="Address that will be published">
        <div className="caps">This address will be published</div>
        {address ? (
          <AddressSummary className="name-pub__addr" value={address} />
        ) : addressFailed ? (
          <p className="name-pub__note">
            Couldn't work out the address.{" "}
            <button type="button" className="link-btn name-field__retry" onClick={onRetryAddress}>
              Try again
            </button>
          </p>
        ) : (
          <div className="skel skel--row" aria-hidden="true" />
        )}
        <p className="name-pub__note">
          A shielded address of this wallet that is used only for your handle. It is not the one on
          your home screen, so its fingerprint differs too, and nobody without your keys can match
          the two.
        </p>
      </section>

      <Notice tone="warn" title="This is public, and it is permanent" announce={false}>
        Claiming writes {subject} and the address above to the blockchain, where anyone can read
        them. They stay in its history for good, even if the handle is later changed or cleared. No
        public account of yours is named: the claim is paid from your shielded funds.
      </Notice>

      <label className="name-ack">
        <input
          type="checkbox"
          className="name-ack__input input-hidden"
          checked={acknowledged}
          disabled={!name || !address}
          onChange={(e) => onAcknowledge(e.target.checked)}
        />
        <span className="name-ack__box" aria-hidden="true">
          <CheckGlyph size={13} strokeWidth={2.8} />
        </span>
        <span className="name-ack__txt">
          I understand that {subject} and this address will be public and cannot be made private
          again
        </span>
      </label>
    </>
  );
}
