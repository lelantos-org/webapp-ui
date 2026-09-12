// The light palette, written once.
//
// A light theme has two ways in: an explicit choice (`<html data-theme="light">`,
// stamped by `public/theme-init.js` and the theme toggle) and the system
// preference when no choice has been made. CSS cannot join a media query and an
// attribute selector in one rule, and two hand-kept copies of the palette drift.
// `tokens.css` holds only the explicit block; this PostCSS plugin repeats it
// under `@media (prefers-color-scheme: light)` for any root that has not chosen
// dark.
//
// PostCSS, not a Vite `transform`: Vite runs the configured PostCSS plugins on
// every stylesheet in dev and build alike, after its own `@import` inlining, so
// the dev server and the shipped CSS cannot disagree.

/// The selector the palette is authored under, and the one it is repeated as.
export const LIGHT_SELECTOR = ':root[data-theme="light"]';
export const SYSTEM_LIGHT_SELECTOR = ':root:not([data-theme="dark"])';
export const SYSTEM_LIGHT_MEDIA = "(prefers-color-scheme: light)";

// The slice of the PostCSS API this uses, typed structurally so the tooling does
// not import `postcss` (a dependency of Vite's, not of this package).
interface CssNode {
  parent?: unknown;
  after(node: CssNode): unknown;
}
interface CssRule extends CssNode {
  selector: string;
  clone(overrides: { selector: string }): CssNode;
}
interface CssAtRule extends CssNode {
  name: string;
  params: string;
  append(node: CssNode): unknown;
}
interface CssRoot {
  walkRules(callback: (rule: CssRule) => void): void;
  walkAtRules(callback: (rule: CssAtRule) => void): void;
}
interface PostcssHelpers {
  AtRule: new (defaults: { name: string; params: string }) => CssAtRule;
}

export interface LightThemePlugin {
  postcssPlugin: string;
  /// `unknown` in, narrowed inside: PostCSS's own `Root` has overloads the
  /// structural types above do not model, and this keeps the plugin assignable
  /// to Vite's `css.postcss.plugins` without importing PostCSS's types.
  Once(root: unknown, helpers: unknown): void;
}

/// Repeats every `:root[data-theme="light"]` rule as the system-preference
/// fallback, directly after it.
///
/// Fails the build if a stylesheet already carries a hand-written fallback: two
/// copies are the thing this exists to prevent, and a stale one would silently
/// win for every visitor who never touched the toggle.
export function lightTheme(): LightThemePlugin {
  return {
    postcssPlugin: "lelantos-light-theme",
    Once(rootNode, helpers) {
      const root = rootNode as CssRoot;
      const { AtRule } = helpers as PostcssHelpers;
      root.walkAtRules((at) => {
        if (at.name === "media" && at.params === SYSTEM_LIGHT_MEDIA) {
          let handWritten = false;
          (at as unknown as CssRoot).walkRules((rule) => {
            if (rule.selector === SYSTEM_LIGHT_SELECTOR) handWritten = true;
          });
          if (handWritten) {
            throw new Error(
              `lightTheme: found a hand-written ${SYSTEM_LIGHT_SELECTOR} block under ${SYSTEM_LIGHT_MEDIA}. ` +
                `Author the light palette once, as ${LIGHT_SELECTOR}; the build repeats it.`,
            );
          }
        }
      });
      const authored: CssRule[] = [];
      root.walkRules((rule) => {
        if (rule.selector === LIGHT_SELECTOR) authored.push(rule);
      });
      for (const rule of authored) {
        const media = new AtRule({ name: "media", params: SYSTEM_LIGHT_MEDIA });
        media.append(rule.clone({ selector: SYSTEM_LIGHT_SELECTOR }));
        rule.after(media);
      }
    },
  };
}
