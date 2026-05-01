import { SuccessCheck } from "@/shared/ui/SuccessCheck";

interface SuccessScreenProps {
  amountLabel: string;
}

/// Post-broadcast confirmation. Auto-advances after a short dwell — see
/// `useClaimLinkStage`'s `runWith`.
export function SuccessScreen({ amountLabel }: SuccessScreenProps) {
  return (
    <SuccessCheck
      caption={
        amountLabel ? (
          <>
            <strong>{amountLabel}</strong> sent. Preparing your link…
          </>
        ) : (
          "Sent. Preparing your link…"
        )
      }
    />
  );
}
