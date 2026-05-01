import { useId, useState } from "react";

interface ConfirmScreenProps {
  amountLabel: string;
  onCancel(): void;
  onConfirm(): void;
}

/// Pre-broadcast review screen.
export function ConfirmScreen({ amountLabel, onCancel, onConfirm }: ConfirmScreenProps) {
  const checkId = useId();
  const [agreed, setAgreed] = useState(false);
  return (
    <>
      <p className="setup-copy">
        You are about to broadcast a private transfer of <strong>{amountLabel}</strong> to a fresh
        ephemeral address. The generated link contains the spending key for that address.
      </p>
      <div className="warn-banner card">
        <strong>⚠ bearer secret.</strong> Anyone who receives this link can claim the funds. Send it
        through a private channel only — never paste into a public chat or anything that logs URLs
        server-side. The transfer is on-chain and cannot be reversed once broadcast.
      </div>
      <label className="setup-copy claim-confirm-check" htmlFor={checkId}>
        <input
          id={checkId}
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
        />{" "}
        I will share this link only through a private channel.
      </label>
      <div className="setup-actions">
        <button type="button" className="btn btn--ghost" onClick={onCancel}>
          cancel
        </button>
        <button type="button" className="btn" onClick={onConfirm} disabled={!agreed} data-primary>
          confirm & generate
        </button>
      </div>
    </>
  );
}
