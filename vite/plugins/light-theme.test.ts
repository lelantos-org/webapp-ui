import { readFileSync } from "node:fs";
import { preprocessCSS, resolveConfig } from "vite";
import { describe, expect, it } from "vitest";
import {
  LIGHT_SELECTOR,
  lightTheme,
  SYSTEM_LIGHT_MEDIA,
  SYSTEM_LIGHT_SELECTOR,
} from "./light-theme";

/// Runs `css` through Vite's own stylesheet pipeline with only this plugin
/// configured — the path both `vite` and `vite build` take.
async function process(css: string): Promise<string> {
  const config = await resolveConfig(
    { configFile: false, logLevel: "silent", css: { postcss: { plugins: [lightTheme()] } } },
    "build",
  );
  return (await preprocessCSS(css, "/virtual/tokens.css", config)).code;
}

/// Declarations as `name: value` pairs, whitespace-normalised.
function declarations(block: string): string[] {
  return block
    .split(";")
    .map((d) => d.replace(/\/\*[\s\S]*?\*\//g, "").trim())
    .filter((d) => d.includes(":"))
    .map((d) => d.replace(/\s*:\s*/, ": "));
}

describe("lightTheme", () => {
  it("repeats the explicit palette under the system preference, right after it", async () => {
    const out = await process(`:root { --bg: #000; }
${LIGHT_SELECTOR} { --bg: #fff; --fg: #111; }
.after { color: red; }`);
    const media = `@media ${SYSTEM_LIGHT_MEDIA}`;
    expect(out.indexOf(LIGHT_SELECTOR)).toBeLessThan(out.indexOf(media));
    expect(out.indexOf(media)).toBeLessThan(out.indexOf(".after"));
    const clone = out.slice(out.indexOf(SYSTEM_LIGHT_SELECTOR));
    expect(declarations(clone.slice(clone.indexOf("{") + 1, clone.indexOf("}")))).toEqual([
      "--bg: #fff",
      "--fg: #111",
    ]);
  });

  it("leaves a stylesheet without the palette alone", async () => {
    const css = ".a { color: red; }\n";
    expect(await process(css)).toBe(css);
  });

  it("refuses a hand-written fallback next to the authored one", async () => {
    await expect(
      process(`${LIGHT_SELECTOR} { --bg: #fff; }
@media ${SYSTEM_LIGHT_MEDIA} { ${SYSTEM_LIGHT_SELECTOR} { --bg: #eee; } }`),
    ).rejects.toThrow(/hand-written/);
  });

  // Against the real file: the palette has to stay authored under the selector
  // this plugin looks for, or the system-preference theme silently disappears.
  it("finds the palette in tokens.css", async () => {
    const tokens = readFileSync(new URL("../../src/styles/tokens.css", import.meta.url), "utf8");
    const out = await process(tokens);
    const authored = out.slice(out.indexOf(`${LIGHT_SELECTOR} {`));
    const clone = out.slice(out.indexOf(`${SYSTEM_LIGHT_SELECTOR} {`));
    const body = (s: string) => declarations(s.slice(s.indexOf("{") + 1, s.indexOf("}")));
    expect(body(clone).length).toBeGreaterThan(20);
    expect(body(clone)).toEqual(body(authored));
  });
});
