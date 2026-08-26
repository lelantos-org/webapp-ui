// Fails when a file reaches for its own feature through the `@/` alias.
//
// The point is that an import should say, at a glance, whether it crosses a
// boundary. `@/features/x` means leaving the current module; `./x` means
// staying inside it. When both spellings are allowed for the same target every
// import line looks alike, and the only way to tell a local helper from a
// dependency on another feature is to know the tree by heart.
//
// Cross-feature imports are untouched — those *should* be absolute.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = "src/features";

/** Every `@/features/<name>` this file mentions, in an import or a vi.mock. */
function referencedFeatures(source) {
  const hits = [];
  const patterns = [
    /from\s+"@\/features\/([a-z0-9-]+)((?:\/[A-Za-z0-9._-]+)*)"/g,
    /import\("@\/features\/([a-z0-9-]+)((?:\/[A-Za-z0-9._-]+)*)"/g,
    /vi\.mock\("@\/features\/([a-z0-9-]+)((?:\/[A-Za-z0-9._-]+)*)"/g,
  ];
  for (const re of patterns) {
    for (const m of source.matchAll(re)) hits.push({ feature: m[1], rest: m[2] ?? "" });
  }
  return hits;
}

function* sourceFiles(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* sourceFiles(path);
    else if (/\.tsx?$/.test(entry)) yield path;
  }
}

const offences = [];
for (const file of sourceFiles(ROOT)) {
  const feature = relative(ROOT, file).split(sep)[0];
  for (const { feature: target, rest } of referencedFeatures(readFileSync(file, "utf8"))) {
    // A bare `@/features/x` from inside x is the feature's own barrel, which is
    // a separate problem (a cycle through index); this rule is about deep paths.
    if (target === feature && rest) offences.push({ file, target, rest });
  }
}

if (offences.length > 0) {
  console.error(`${offences.length} same-feature import(s) using the "@/" alias:\n`);
  for (const { file, target, rest } of offences) {
    console.error(`  ${file}\n    @/features/${target}${rest}  ->  use a relative path`);
  }
  console.error('\nWithin a feature, import relatively ("./thing", "../thing").');
  process.exit(1);
}

console.log("imports: no same-feature alias imports");
