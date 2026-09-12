# Lelantos Wallet

A browser-based shielded wallet for the MASP (Multi-Asset Shielded Pool), built as a Progressive Web App. It supports shielded transfers, swaps, claim links, and asset management, with zero-knowledge proofs generated client-side via WebAssembly.

## Tech Stack

- [React 18](https://react.dev/) with TypeScript, bundled by [Vite](https://vite.dev/)
- [`@lelantos-org/sdk`](https://www.npmjs.com/package/@lelantos-org/sdk) and [`@lelantos-org/circuits`](https://www.npmjs.com/package/@lelantos-org/circuits) for shielded-pool operations and proving
- [TanStack Query](https://tanstack.com/query) for server state, [React Hook Form](https://react-hook-form.com/) + [Zod](https://zod.dev/) for forms and validation
- [viem](https://viem.sh/) for Ethereum interaction, [idb](https://github.com/jakearchibald/idb) for IndexedDB persistence
- [Biome](https://biomejs.dev/) for linting and formatting, [Vitest](https://vitest.dev/) for testing
- [vite-plugin-pwa](https://vite-pwa-org.netlify.app/) for offline support and installability

## Prerequisites

- Node.js 24+
- npm with access to the `@lelantos-org` registry scope (see `.npmrc`)
- Local backend services when developing against the default proxy configuration (see [Development](#development))
- Any EIP-6963 browser wallet — MetaMask, Rabby, Rainbow, Zerion. Discovery is by
  announcement, so no wallet is special-cased; with more than one installed the app asks
  which to use and remembers the choice per browser.

## Getting Started

```bash
npm ci
cp .env.example .env
npm run dev
```

The dev server listens on port `5174`.

## Configuration

Environment variables are validated at startup in [`src/config/env.ts`](src/config/env.ts). Invalid or missing required values fail fast with a descriptive error.

Only the services are configured here. Everything per-chain — chain id and name,
RPC, contract addresses, tree depth, explorer, the asset catalog — is discovered
at runtime, so one build serves every deployment and a redeployed contract needs
no rebuild.

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `VITE_REGISTRY_URL` | Yes | — | registry-webserver base URL: what each chain is, and what is registered on it |
| `VITE_RELAYER_URL` | Yes | — | Relayer API base URL: what one relayer will do on each chain |
| `VITE_FMD_URL` | Yes | — | Fuzzy message detection service URL |
| `VITE_METAQUOTER_URL` | No | — | Metaquoter (swap quoting) service URL; absent leaves the swap tab inert |

### Why two bootstraps

`VITE_REGISTRY_URL` and `VITE_RELAYER_URL` are both required and neither is
derivable from the other. registry-webserver publishes the deployment's own
account of a chain; the relayer publishes what that one relayer will do on it.
The two overlap only on `maspAddress` and `treeDepth`, and the app compares them
before using a chain — dropping any where they disagree. That check is what makes
a self-hosted or third-party relayer safe to point this wallet at, so a
deployment configured with only one of the two has no usable network rather than
a degraded one.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Type-check and build for production |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | Type-check the app and the tooling (`tsc -b`, no emit) |
| `npm run check` | Biome lint, format and import sorting, with autofix |
| `npm run check:ci` | The same Biome checks, without writing |
| `npm run check:imports` | The import rules Biome cannot see (`scripts/check-imports.mjs`) |
| `npm run knip` | Unused files, exports and dependencies |
| `npm run test` | Run the test suite once |
| `npm run test:coverage` | Run the test suite under its coverage floor |
| `npm run verify` | Typecheck, `check:ci`, `check:imports`, `knip` and `test:coverage` (the CI gate) |

## Development

### Service proxies

The dev server proxies the following paths to local backend services, so relative service URLs (as in `.env.example`) work without CORS configuration:

| Path | Target |
| --- | --- |
| `/registry` | `http://localhost:3005` (override with `REGISTRY_PROXY_TARGET`) |
| `/relayer` | `http://localhost:3003` (override with `RELAYER_PROXY_TARGET`) |
| `/fmd` | `http://localhost:3001` |
| `/metaquoter` | `http://localhost:8081` |
| `/explorer` | `http://localhost:3002` |
| `/rpc` | `http://localhost:3006` (rpc-proxy) |

The table lives in [`vite/proxy.ts`](vite/proxy.ts); the service worker's navigation fallback skips the same prefixes.

### Cross-origin isolation

The multithreaded WASM prover requires `SharedArrayBuffer`, which browsers only expose in cross-origin-isolated contexts. The dev and preview servers set the required headers:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Any production deployment must serve the app with these same headers.

## Testing

```bash
npm run test
```

Tests run with Vitest under Node; a suite that needs a DOM opts into jsdom with `// @vitest-environment jsdom` on its first line, and uses Testing Library for components. `npm run verify` runs the full quality gate: typecheck, Biome checks, the import rules, knip, and the tests under their coverage floor.

## Docker

The production image builds the app and serves it with nginx:

```bash
docker build \
  --secret id=npm_token,env=NODE_AUTH_TOKEN \
  -t lelantos-wallet .
```

Environment variables are baked in at build time. The service URLs default to the same-origin paths in `.env.example` (`/registry`, `/relayer`, `/fmd`, `/metaquoter`); override any with `--build-arg VITE_REGISTRY_URL=...` and so on. The npm token secret is required to install `@lelantos-org` packages. The bundled [`nginx.conf`](nginx.conf) serves the SPA on port 80.
