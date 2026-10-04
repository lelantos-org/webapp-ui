import { createHash } from "node:crypto";
import { readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Plugin } from "vite";

/// The content-hashed path for `name` (`theme-init.js` → `assets/theme-init-1a2b3c4d.js`).
export function hashedName(name: string, source: Uint8Array): string {
  const hash = createHash("sha256").update(source).digest("hex").slice(0, 8);
  const dot = name.lastIndexOf(".");
  return `assets/${name.slice(0, dot)}-${hash}${name.slice(dot)}`;
}

/// `html` with the script tag for `from` pointing at `to`. Throws when the tag is gone, so the
/// build cannot ship a page that loads the removed file.
export function retargetScript(html: string, from: string, to: string): string {
  const tag = `<script src="${from}">`;
  if (!html.includes(tag)) {
    throw new Error(`hashedPublicScript: no ${tag} in index.html`);
  }
  return html.replace(tag, `<script src="${to}">`);
}

/// Build-only: ships a classic script from `public/` under a content-hashed name, so it can be
/// cached for a year like every other asset. The dev server keeps serving it from `public/`.
///
/// A classic script because a module is deferred, and this one must run before first paint.
export function hashedPublicScript(name: string): Plugin {
  let base = "/";
  let outDir = "dist";
  let source: Uint8Array = new Uint8Array();
  let hashed = "";
  return {
    name: "hashed-public-script",
    apply: "build",
    configResolved(config) {
      base = config.base;
      outDir = resolve(config.root, config.build.outDir);
      source = readFileSync(join(config.publicDir, name));
      hashed = hashedName(name, source);
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: hashed, source });
    },
    transformIndexHtml: {
      order: "post",
      handler: (html) => retargetScript(html, `${base}${name}`, `${base}${hashed}`),
    },
    writeBundle() {
      // The copy Vite makes of everything in `public/`: nothing names it any more.
      rmSync(join(outDir, name), { force: true });
    },
  };
}
