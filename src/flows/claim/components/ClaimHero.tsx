import { ShieldKeyholeGlyph } from "@/shared/ui/icons/shield";
import { WideNarrow } from "@/shared/ui/WideNarrow";
import "./ClaimHero.css";

/// The claim page's title block; `subtitle` follows the flow.
export function ClaimHero({ subtitle }: { subtitle?: string | undefined }) {
  return (
    <div className="claim-hero">
      <span className="claim-hero__mark">
        <ShieldKeyholeGlyph size={30} />
      </span>
      <h1 className="claim-hero__t">Someone sent you funds</h1>
      <p className="claim-hero__sub">
        {subtitle ?? (
          <WideNarrow
            wide="Check what's here, then claim it. The funds land in your own shielded wallet — private from the moment they arrive."
            narrow="Claim them into your own shielded wallet."
          />
        )}
      </p>
    </div>
  );
}
