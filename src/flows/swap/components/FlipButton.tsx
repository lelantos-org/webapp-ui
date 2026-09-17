import { ArrowDownGlyph } from "@/shared/ui/icons/glyphs";
import "../swap.css";

/// Reverses the pair.
export function FlipButton({ onFlip, disabled }: { onFlip(): void; disabled: boolean }) {
  return (
    <div className="swap-flip-row">
      <button
        type="button"
        className="swap-flip"
        onClick={onFlip}
        disabled={disabled}
        aria-label="Reverse the pair"
        title="Reverse the pair"
      >
        <ArrowDownGlyph size={17} />
      </button>
    </div>
  );
}
