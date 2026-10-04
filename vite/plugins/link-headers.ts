import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Plugin } from "vite";

/// The tags a built `index.html` loads eagerly, each capturing its URL as `href`, and what to
/// preload it as. A preload tag says so itself, captured as `as`.
const EAGER_TAGS: readonly (readonly [tag: RegExp, as?: string])[] = [
  [/<script[^>]+src="(?<href>[^"]+)"[^>]*>/g, "script"],
  [/<link[^>]+rel="modulepreload"[^>]+href="(?<href>[^"]+)"[^>]*>/g, "script"],
  [/<link[^>]+rel="stylesheet"[^>]+href="(?<href>[^"]+)"[^>]*>/g, "style"],
  [/<link[^>]+rel="preload"[^>]+as="(?<as>[^"]+)"[^>]+href="(?<href>[^"]+)"[^>]*>/g],
];

/// `Link: rel=preload` entries for the assets `html` loads eagerly: scripts, then module preloads,
/// then stylesheets, then what the page preloads itself.
///
/// `crossorigin` follows each tag: a preload whose credentials mode differs from the tag's is not
/// used, and the asset is fetched twice. Cloudflare's 103 needs `rel=preload`.
export function preloadLinks(html: string): string[] {
  return EAGER_TAGS.flatMap(([tag, as]) =>
    [...html.matchAll(tag)].map(({ 0: whole, groups }) => {
      const crossorigin = /\scrossorigin\b/.test(whole) ? "; crossorigin" : "";
      return `<${groups?.href}>; rel=preload; as=${groups?.as ?? as}${crossorigin}`;
    }),
  );
}

/// The nginx snippet for `links`; never empty, since the Dockerfile and nginx include it unconditionally.
export function linkHeaderSnippet(links: readonly string[]): string {
  if (links.length === 0) return "# No eagerly-loaded assets found in index.html.\n";
  return `add_header Link "${links.join(", ")}" always;\n`;
}

/// Writes an nginx `Link` preload header for Cloudflare Early Hints, outside the served `dist/`.
export function linkHeaders(): Plugin {
  let outDir = "dist";
  let root = process.cwd();
  return {
    name: "link-headers",
    apply: "build",
    enforce: "post",
    configResolved(config) {
      outDir = config.build.outDir;
      root = config.root;
    },
    closeBundle() {
      const links = preloadLinks(readFileSync(join(outDir, "index.html"), "utf8"));

      const dir = join(root, ".nginx");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "link-headers.conf"), linkHeaderSnippet(links));
      if (links.length === 0) {
        this.warn("link-headers: nothing matched in index.html; wrote an empty snippet");
        return;
      }
      this.info(`link-headers: hinted ${links.length} assets`);
    },
  };
}
