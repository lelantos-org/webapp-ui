import { usePrivacy } from "@/shared/hooks/use-privacy";
import { EyeGlyph, EyeOffGlyph } from "@/shared/ui/icons/glyphs";
import "./header-button.css";

export function PrivacyToggle() {
  const { hidden, toggle } = usePrivacy();
  return (
    <button
      type="button"
      className="hdr-btn"
      onClick={toggle}
      title={hidden ? "show amounts" : "hide amounts"}
      aria-label="hide amounts"
      aria-pressed={hidden}
    >
      {hidden ? <EyeOffGlyph size={15} /> : <EyeGlyph size={15} />}
    </button>
  );
}
