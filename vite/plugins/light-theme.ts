/// The selector the palette is authored under, and the one it is repeated as.
export const LIGHT_SELECTOR = ':root[data-theme="light"]';
export const SYSTEM_LIGHT_SELECTOR = ':root:not([data-theme="dark"])';
export const SYSTEM_LIGHT_MEDIA = "(prefers-color-scheme: light)";

// Structural slice of the PostCSS API, so tooling need not depend on `postcss`.
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
  Once(root: unknown, helpers: unknown): void;
}

/// Repeats the light palette under `prefers-color-scheme: light`; fails on a hand-written copy.
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
