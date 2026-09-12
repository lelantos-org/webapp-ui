import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { linkHeaderSnippet, linkHeaders, preloadLinks } from "./link-headers";

const BUILT = `<!doctype html>
<html>
  <head>
    <script src="/theme-init.js"></script>
    <script type="module" crossorigin src="/assets/index-abc.js"></script>
    <link rel="modulepreload" crossorigin href="/assets/vendor-react-def.js">
    <link rel="stylesheet" crossorigin href="/assets/index-123.css">
    <link rel="icon" type="image/svg+xml" href="/icon.svg" />
    <link rel="manifest" href="/manifest.webmanifest">
  </head>
</html>`;

describe("preloadLinks", () => {
  it("hints entry scripts, module preloads and stylesheets, in that order", () => {
    expect(preloadLinks(BUILT)).toEqual([
      "</theme-init.js>; rel=preload; as=script; crossorigin",
      "</assets/index-abc.js>; rel=preload; as=script; crossorigin",
      "</assets/vendor-react-def.js>; rel=preload; as=script; crossorigin",
      "</assets/index-123.css>; rel=preload; as=style; crossorigin",
    ]);
  });

  it("hints nothing that is not loaded eagerly", () => {
    expect(preloadLinks('<link rel="icon" href="/icon.svg">')).toEqual([]);
  });
});

describe("linkHeaderSnippet", () => {
  it("joins the links into one always-sent header", () => {
    expect(linkHeaderSnippet(["<a.js>; rel=preload", "<b.css>; rel=preload"])).toBe(
      'add_header Link "<a.js>; rel=preload, <b.css>; rel=preload" always;\n',
    );
  });

  // The Dockerfile and nginx include it unconditionally.
  it("still writes a file, as a comment, when there is nothing to hint", () => {
    expect(linkHeaderSnippet([])).toMatch(/^# /);
  });
});

describe("linkHeaders plugin", () => {
  let root: string | undefined;

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
    root = undefined;
  });

  /// Drive the plugin's two hooks the way Vite would, against a temp project.
  function run(html: string) {
    root = mkdtempSync(join(tmpdir(), "link-headers-"));
    const outDir = join(root, "dist");
    mkdirSync(outDir);
    writeFileSync(join(outDir, "index.html"), html);

    const plugin = linkHeaders();
    const ctx = { info: vi.fn(), warn: vi.fn() };
    // The hooks are plain functions here; Vite's types also admit `{ handler }`.
    const configResolved = plugin.configResolved as unknown as (c: unknown) => void;
    const closeBundle = plugin.closeBundle as unknown as (this: typeof ctx) => void;
    configResolved({ build: { outDir }, root });
    closeBundle.call(ctx);
    return { ctx, snippet: readFileSync(join(root, ".nginx", "link-headers.conf"), "utf8") };
  }

  it("writes the snippet beside the project, outside what is served", () => {
    const { ctx, snippet } = run(BUILT);
    expect(snippet).toBe(linkHeaderSnippet(preloadLinks(BUILT)));
    expect(ctx.info).toHaveBeenCalledWith("link-headers: hinted 4 assets");
  });

  it("warns when the document stopped matching", () => {
    const { ctx, snippet } = run("<html></html>");
    expect(snippet).toBe(linkHeaderSnippet([]));
    expect(ctx.warn).toHaveBeenCalled();
  });
});
