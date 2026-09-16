import { useTheme } from "@/shared/hooks/use-theme";
import { MoonGlyph, SunGlyph } from "@/shared/ui/icons/glyphs";
import "./ThemeToggle.css";

/// Switch between the two themes.
///
/// A button rather than a checkbox: it performs an action on press instead of
/// representing a value, and `aria-pressed` would claim "dark" is the unset
/// state when neither is. The label names what a press does, not where you are.
export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      title={`switch to ${next} theme`}
      aria-label={`switch to ${next} theme`}
    >
      {theme === "dark" ? <SunGlyph size={15} /> : <MoonGlyph size={15} />}
    </button>
  );
}
