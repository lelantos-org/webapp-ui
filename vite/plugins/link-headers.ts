import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Plugin } from "vite";

/// `Link: rel=preload` entries for the assets `html` loads eagerly, in document order.
///
/// `crossorigin` must match Vite's tags or the asset is fetched twice; Cloudflare's 103 needs `rel=preload`.
export function preloadLinks(html: string): string[] {
  const links: string[] = [];
  const push = (href: string | undefined, as: string) => {
    if (href) links.push(`<${href}>; rel=preload; as=${as}; crossorigin`);
  };

  for (const [, href] of html.matchAll(/<script[^>]+src="([^"]+)"/g)) push(href, "script");
  for (const [, href] of html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"/g)) {
    push(href, "script");
  }
  for (const [, href] of html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)) {
    push(href, "style");
  }
  return links;
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
