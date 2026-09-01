// The set of chains the app can operate on, and the shape of one of them.
//
// Sourced entirely from the relayer's `/chains`, the only service that
// enumerates every chain a deployment serves. A chain can therefore be added,
// or its addresses redeployed, without rebuilding this bundle, and no per-chain
// `VITE_*` var is needed.
//
// Four modules, in dependency order — a later one may import an earlier one and
// never the reverse:
//
//   `types.ts`     `ChainEntry`, `RegisteredAsset`, and the two lookups. No
//                  dependencies, so a module wanting only the types does not
//                  pull zod or `env` in behind it.
//   `schema.ts`    the wire shape of `/chains`, as zod.
//   `parse.ts`     row -> `ChainEntry`, and what to do with a row that cannot
//                  become one. Pure; testable against a literal row.
//   `registry.ts`  the fetch and the `localStorage` copy. The only I/O.
//
// This file is the public surface: importers say `@/config/chains` and are
// unaffected by which of the four a symbol lives in. The row types, the
// per-row result and `toChainEntry` are deliberately absent — nothing outside
// this directory parses a `/chains` row, and re-exporting them would invite it.
// Within the module, import the files directly.

export { loadChainRegistry, readCachedChainRegistry } from "./registry";
export type { ChainEntry, RegisteredAsset } from "./types";
export { chainKey, findChain } from "./types";
