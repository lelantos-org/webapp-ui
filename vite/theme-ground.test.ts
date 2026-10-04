import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The page ground is written out wherever CSS cannot reach: the browser chrome before any
// stylesheet loads, the script that stamps the theme, the hook that repaints it, the manifest.
// A copy left behind after a palette change shows as a band of the wrong colour above the app.

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

/// `--bg` of each theme, in the order tokens.css declares them: dark, then light.
function grounds(): { dark: string; light: string } {
  const [dark, light] = [
    ...read("src/styles/tokens.css").matchAll(/--bg:\s*(#[0-9A-Fa-f]{6});/g),
  ].map((m) => m[1]);
  if (!dark || !light) throw new Error("tokens.css no longer declares --bg for both themes");
  return { dark, light };
}

describe("the page ground outside CSS", () => {
  const { dark, light } = grounds();

  it.each([
    ["index.html", "index.html"],
    ["the theme init script", "public/theme-init.js"],
    ["the theme hook", "src/shared/hooks/use-theme.ts"],
  ])("%s carries both themes' ground", (_label, path) => {
    const text = read(path);
    expect(text).toContain(dark);
    expect(text).toContain(light);
  });

  it("the manifest opens on the default (dark) ground", () => {
    const text = read("vite/pwa.ts");
    expect(text).toContain(`theme_color: "${dark}"`);
    expect(text).toContain(`background_color: "${dark}"`);
  });
});
