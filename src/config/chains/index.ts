// The set of chains the app can operate on, and the shape of one of them.
//
// Merged from two services. registry-webserver enumerates the chains the
// deployment serves and the assets registered on them; the relayer says what it
// will do on each. A chain survives only where both describe it and their two
// accounts of the pool and tree shape agree — the check that makes a
// third-party or self-hosted relayer safe to boot from.
//
// A chain can therefore be added, or its addresses redeployed, without
// rebuilding this bundle, and no per-chain `VITE_*` var is needed.
//
// Four modules, in dependency order — a later one may import an earlier one and
// never the reverse:
//
//   `types.ts`     `ChainEntry`, `RegisteredAsset`, and the two lookups. No
//                  dependencies, so a module wanting only the types does not
//                  pull zod or `env` in behind it.
//   `schema.ts`    the wire shape of the three responses, as zod.
//   `parse.ts`     rows -> `ChainEntry`, the cross-check between the two
//                  services, and what to do with a chain that cannot become
//                  one. Pure; testable against literal rows.
//   `registry.ts`  the fetches and the `localStorage` copy. The only I/O.
//
// This file is the public surface: importers say `@/config/chains` and are
// unaffected by which of the four a symbol lives in. The row types, the
// per-chain result and `toChainEntry` are deliberately absent — nothing outside
// this directory parses a wire row, and re-exporting them would invite it.
// Within the module, import the files directly.

export { txExplorerUrl } from "./explorer";
export { loadChainRegistry, readCachedChainRegistry } from "./registry";
export type { ChainEntry, RegisteredAsset } from "./types";
export { chainKey, findChain } from "./types";
