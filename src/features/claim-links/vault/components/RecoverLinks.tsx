import { useState } from "react";
import { useActiveChain } from "@/features/chain";
import { useSession, useWalletInstance } from "@/features/wallet";
import { reportError } from "@/shared/lib/errors";
import { plural } from "@/shared/lib/format/text";
import { Notice } from "@/shared/ui/Notice";
import { linkProbe, type RecoveredLinks, recoverClaimLinks } from "../../ephemeral/seed-links";

type State =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "done"; out: RecoveredLinks }
  | { kind: "failed"; message: string };

export function recoveredSentence(out: RecoveredLinks, chainName: string): string {
  if (out.funded === 0) return `This wallet has not made a link on ${chainName}.`;
  if (out.unclaimed === 0) {
    return `Every one of this wallet's ${plural(out.funded, "link")} on ${chainName} has been claimed.`;
  }
  const added =
    out.restored === 0 ? "all already in this list" : `${out.restored} added to this list`;
  return `${plural(out.unclaimed, "unclaimed link")} on ${chainName}, ${added}.`;
}

/// Rebuilds the list from the wallet: link keys derive from it, so any browser can find the
/// unclaimed ones.
export function RecoverLinks() {
  const wallet = useWalletInstance();
  const { layer } = useSession();
  const chain = useActiveChain();
  const [state, setState] = useState<State>({ kind: "idle" });

  if (!wallet || !layer) return null;

  const run = () => {
    setState({ kind: "running" });
    recoverClaimLinks(wallet, chain.chainId, linkProbe(layer, chain)).then(
      (out) => setState({ kind: "done", out }),
      (err) =>
        setState({ kind: "failed", message: reportError("claim-links:recover", err).message }),
    );
  };

  if (state.kind === "failed") {
    return (
      <Notice tone="err" title="Could not look for links" actionLabel="Try again" onAction={run}>
        {state.message}
      </Notice>
    );
  }

  return (
    <Notice
      tone="neutral"
      title="Missing a link?"
      {...(state.kind === "running" ? {} : { actionLabel: "Find unclaimed links", onAction: run })}
    >
      {state.kind === "running"
        ? `Looking through this wallet's links on ${chain.chainName}…`
        : state.kind === "done"
          ? recoveredSentence(state.out, chain.chainName)
          : "Links are derived from this wallet's key, so the ones nobody has claimed can be found " +
            `again here, in any browser. This looks on ${chain.chainName}.`}
    </Notice>
  );
}
