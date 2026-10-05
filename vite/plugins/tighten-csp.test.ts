import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { tightenCspHtml } from "./tighten-csp";

const indexHtml = readFileSync(new URL("../../index.html", import.meta.url), "utf8");

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
  // Runs against the real index.html so the plugin's needles are checked too.
  it("strips the dev-only allowances from the shipped policy", () => {
    const csp = directives(tightenCspHtml(indexHtml));
    expect(csp.get("script-src")).toBe("'self' 'wasm-unsafe-eval'");
    expect(csp.get("connect-src")).toBe("'self' https: wss: http://localhost:* http://127.0.0.1:*");
    expect(csp.get("require-trusted-types-for")).toBe("'script'");
    expect(csp.get("trusted-types")).toBe("'none'");
  });

  // The endpoint settings accept a URL the user types; one the CSP then blocks would break the app.
  it("admits plain http to exactly the hosts the endpoint settings accept", () => {
    const source = readFileSync(new URL("../../src/config/endpoints.ts", import.meta.url), "utf8");
    const list = source.match(/LOOPBACK_HOSTS[^=]*= new Set\(\[([^\]]+)\]\)/)?.[1] ?? "";
    const hosts = [...list.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect(hosts.length).toBeGreaterThan(0);

    const sources = directives(tightenCspHtml(indexHtml)).get("connect-src")?.split(" ") ?? [];
    expect(sources.filter((s) => s.startsWith("http:"))).toEqual(
      hosts.map((host) => `http://${host}:*`),
    );
  });

  it("leaves every other directive as written", () => {
    const before = directives(indexHtml);
    const after = directives(tightenCspHtml(indexHtml));
    for (const [name, value] of before) {
      if (name === "script-src" || name === "connect-src") continue;
      expect(after.get(name)).toBe(value);
    }
  });

  it("fails when a directive it tightens no longer matches", () => {
    const reworded = indexHtml.replace(
      "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
      "script-src 'unsafe-inline' 'self' 'wasm-unsafe-eval'",
    );
    expect(() => tightenCspHtml(reworded)).toThrow(/tightenCsp: no match for/);
  });
});
