import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Plugin } from "vite";

/// `Link: rel=preload` entries for every asset `html` loads eagerly, in
/// document order: entry scripts, module preloads, then stylesheets.
///
/// `as=script` with `crossorigin`, matching the attributes Vite puts on
/// the tags. The credentials mode has to agree or the preloaded response
/// is not reused and the asset is fetched twice.
///
/// `rel=preload`, not `rel=modulepreload`, because Cloudflare drops
/// anything else when it synthesises the 103.
export function preloadLinks(html: string): string[] {
  const links: string[] = [];
  // Every pattern below has one capture group, so `href` is always set on a match.
  const push = (href: string | undefined, as: string) => {
    if (href) links.push(`<${href}>; rel=preload; as=${as}; crossorigin`);
  };

  for (const [, href] of html.matchAll(/<script[^>]+src="([^"]+)"/g)) push(href, "script");
  for (const [, href] of html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"/g)) {
    push(href, "script");
  }
  // Render-blocking, so the least ambiguous win of the three.
  for (const [, href] of html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)) {
    push(href, "style");
  }
  return links;
}

/// The nginx snippet for `links`.
///
/// An empty file's worth of comment rather than nothing: the Dockerfile COPY
/// and the nginx include both reference it unconditionally, and a missing file
/// fails the image build with a message about the copy rather than about the
/// markup that stopped matching.
export function linkHeaderSnippet(links: readonly string[]): string {
  if (links.length === 0) return "# No eagerly-loaded assets found in index.html.\n";
  return `add_header Link "${links.join(", ")}" always;\n`;
}

/// Emits an nginx snippet with a `Link: rel=preload` header for the assets
/// `index.html` loads eagerly.
///
/// The zone has Early Hints enabled (infra/terraform/zone.tf), and Cloudflare
/// builds a `103 Early Hints` response out of the origin's `Link` headers —
/// but only out of `rel=preload` and `rel=preconnect`. nginx sent no `Link` at
/// all, so the setting was on and doing nothing.
///
/// Vite already writes `<link rel="modulepreload">` into the document, but the
/// browser cannot act on those until the document has arrived and been parsed.
/// A 103 starts the same fetches a round-trip earlier, which is worth most on
/// exactly the requests that are slowest: an edge MISS on the document, where
/// the browser would otherwise sit idle for a full trip to the origin.
///
/// Reads the emitted HTML rather than the bundle graph so the header can never
/// disagree with the document — whatever Vite decided to load eagerly is what
/// gets hinted, including the hashes.
///
/// Writes outside `outDir` deliberately: everything under `dist/` is served,
/// and an nginx config fragment is not something to publish. The Dockerfile
/// copies it to /etc/nginx/ from the builder stage.
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
