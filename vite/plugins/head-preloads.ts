import type { HtmlTagDescriptor, Plugin, Rollup } from "vite";

type Bundle = Rollup.OutputBundle;

/// The built files of the fonts named: `public-sans` matches `assets/public-sans-<hash>.woff2`.
export function fontFiles(bundle: Bundle, names: readonly string[]): string[] {
  return names.map((name) => {
    const file = Object.keys(bundle).find(
      (f) => f.startsWith(`assets/${name}-`) && f.endsWith(".woff2"),
    );
    if (!file) throw new Error(`headPreloads: no built font named ${name}`);
    return file;
  });
}

/// The files a lazily loaded screen needs: the chunk built from the module ending in `facade`,
/// the chunks it imports statically, and their stylesheets.
export function screenFiles(
  bundle: Bundle,
  facade: string,
): { scripts: string[]; styles: string[] } {
  const chunks = Object.values(bundle).filter((f) => f.type === "chunk");
  const root = chunks.find((c) => c.facadeModuleId?.replaceAll("\\", "/").endsWith(facade));
  if (!root) throw new Error(`headPreloads: no chunk built from ${facade}`);

  const seen = new Set<string>();
  const styles = new Set<string>();
  const walk = (fileName: string) => {
    if (seen.has(fileName)) return;
    seen.add(fileName);
    const chunk = chunks.find((c) => c.fileName === fileName);
    for (const css of chunk?.viteMetadata?.importedCss ?? []) styles.add(css);
    for (const next of chunk?.imports ?? []) walk(next);
  };
  walk(root.fileName);
  return { scripts: [...seen], styles: [...styles] };
}

export interface HeadPreloads {
  /// Fonts the first paint sets text in, by file stem.
  fonts: readonly string[];
  /// The screen most visits open on, as the tail of its module path.
  screen: string;
}

/// Build-only: adds preload tags to `index.html` for the fonts and for the landing screen's
/// chunks, which the browser would otherwise find only after the stylesheet and the entry chunk
/// have run. `linkHeaders` turns the same tags into Early Hints.
export function headPreloads({ fonts, screen }: HeadPreloads): Plugin {
  let base = "/";
  return {
    name: "head-preloads",
    apply: "build",
    configResolved(config) {
      base = config.base;
    },
    transformIndexHtml: {
      order: "post",
      handler(html, { bundle }) {
        if (!bundle) return html;
        const { scripts, styles } = screenFiles(bundle, screen);
        const link = (
          attrs: Record<string, string | boolean>,
          file: string,
        ): HtmlTagDescriptor => ({
          tag: "link",
          // `crossorigin` on each: Vite loads its chunks and stylesheets that way, fonts always
          // are, and a preload in another credentials mode is fetched twice.
          attrs: { ...attrs, crossorigin: true, href: `${base}${file}` },
          injectTo: "head",
        });
        // What the page already loads eagerly needs no second tag.
        const fresh = (file: string) => !html.includes(`${base}${file}"`);
        return [
          ...fontFiles(bundle, fonts).map((f) =>
            link({ rel: "preload", as: "font", type: "font/woff2" }, f),
          ),
          ...scripts.filter(fresh).map((f) => link({ rel: "modulepreload" }, f)),
          ...styles.filter(fresh).map((f) => link({ rel: "preload", as: "style" }, f)),
        ];
      },
    },
  };
}
