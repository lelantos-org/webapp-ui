import type { Rollup } from "vite";
import { describe, expect, it } from "vitest";
import { fontFiles, screenFiles } from "./head-preloads";

function chunk(fileName: string, imports: string[], over: Record<string, unknown> = {}) {
  return [fileName, { type: "chunk", fileName, imports, facadeModuleId: null, ...over }] as const;
}

const asset = (fileName: string) => [fileName, { type: "asset", fileName }] as const;

const bundle = Object.fromEntries([
  chunk("assets/index-1.js", ["assets/vendor-react-2.js"]),
  chunk("assets/vendor-react-2.js", []),
  chunk("assets/Home-3.js", ["assets/index-1.js", "assets/PortfolioHero-4.js"], {
    facadeModuleId: "/repo/src/app/home/Home.tsx",
    viteMetadata: { importedCss: new Set(["assets/Home-5.css"]) },
  }),
  chunk("assets/PortfolioHero-4.js", ["assets/index-1.js"], {
    viteMetadata: { importedCss: new Set(["assets/PortfolioHero-6.css"]) },
  }),
  chunk("assets/shield-7.js", ["assets/index-1.js"], {
    facadeModuleId: "/repo/src/flows/shield/DepositForm.tsx",
  }),
  asset("assets/public-sans-8.woff2"),
  asset("assets/newsreader-9.woff2"),
]) as unknown as Rollup.OutputBundle;

describe("fontFiles", () => {
  it("finds each named font's built file, in the order asked", () => {
    expect(fontFiles(bundle, ["newsreader", "public-sans"])).toEqual([
      "assets/newsreader-9.woff2",
      "assets/public-sans-8.woff2",
    ]);
  });

  it("fails the build on a font that was not built", () => {
    expect(() => fontFiles(bundle, ["martian-mono"])).toThrow(/martian-mono/);
  });
});

describe("screenFiles", () => {
  it("collects the screen's chunk, what it imports at any depth, and their stylesheets", () => {
    expect(screenFiles(bundle, "/src/app/home/Home.tsx")).toEqual({
      scripts: [
        "assets/Home-3.js",
        "assets/index-1.js",
        "assets/vendor-react-2.js",
        "assets/PortfolioHero-4.js",
      ],
      styles: ["assets/Home-5.css", "assets/PortfolioHero-6.css"],
    });
  });

  it("leaves out every other screen", () => {
    expect(screenFiles(bundle, "/src/app/home/Home.tsx").scripts).not.toContain(
      "assets/shield-7.js",
    );
  });

  it("fails the build when the screen's module is gone", () => {
    expect(() => screenFiles(bundle, "/src/app/home/Gone.tsx")).toThrow(/Gone\.tsx/);
  });
});
