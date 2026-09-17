import { useTheme } from "@/shared/hooks/use-theme";
import { MoonGlyph, SunGlyph } from "@/shared/ui/icons/glyphs";
import "./ThemeToggle.css";

/// Header button that switches between light and dark themes.
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
