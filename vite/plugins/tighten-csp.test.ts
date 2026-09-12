import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { tightenCspHtml } from "./tighten-csp";

const indexHtml = readFileSync(new URL("../../index.html", import.meta.url), "utf8");

/// The meta policy's `content`, split into directives.
function directives(html: string): Map<string, string> {
  const content = html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/)?.[1];
  if (!content) throw new Error("no meta CSP");
  return new Map(
    content.split(";").map((d) => {
      const [name = "", ...values] = d.trim().split(/\s+/);
      return [name, values.join(" ")] as const;
    }),
  );
}

describe("tightenCspHtml", () => {
  // Against the real `index.html`: the plugin's needles have to keep matching
  // the file it rewrites, which is exactly what a unit fixture could not catch.
  it("strips the dev-only allowances from the shipped policy", () => {
    const csp = directives(tightenCspHtml(indexHtml));
    expect(csp.get("script-src")).toBe("'self' 'wasm-unsafe-eval'");
    expect(csp.get("connect-src")).toBe("'self' https: wss:");
    expect(csp.get("require-trusted-types-for")).toBe("'script'");
    expect(csp.get("trusted-types")).toBe("'none'");
  });

  it("leaves every other directive as written", () => {
    const before = directives(indexHtml);
    const after = directives(tightenCspHtml(indexHtml));
    for (const [name, value] of before) {
      if (name === "script-src" || name === "connect-src") continue;
      expect(after.get(name)).toBe(value);
    }
  });

  // The dangerous direction: a reworded directive must fail the build rather
  // than ship the loose dev policy.
  it("fails when a directive it tightens no longer matches", () => {
    const reworded = indexHtml.replace(
      "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
      "script-src 'unsafe-inline' 'self' 'wasm-unsafe-eval'",
    );
    expect(() => tightenCspHtml(reworded)).toThrow(/tightenCsp: no match for/);
  });
});
