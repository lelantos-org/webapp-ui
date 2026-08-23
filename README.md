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

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `VITE_CHAIN_ID` | No | `31337` | Target chain ID |
| `VITE_CHAIN_NAME` | No | `local` | Human-readable chain name |
| `VITE_RPC_URL` | Yes | — | Ethereum JSON-RPC endpoint |
| `VITE_MASP_ADDRESS` | No | — | MASP contract address |
| `VITE_RELAYER_URL` | Yes | — | Relayer API base URL |
| `VITE_FMD_URL` | Yes | — | Fuzzy message detection service URL |
| `VITE_RELAYER_ADDRESS` | Yes | — | Relayer account address |
| `VITE_PERMIT2_ADDRESS` | No | — | Permit2 contract address |
| `VITE_TREE_DEPTH` | No | `20` | Commitment tree depth |
| `VITE_EXPLORER_URL` | No | — | Block explorer base URL |
| `VITE_EXPLORER_API_URL` | No | `/explorer` | Explorer API base URL |
| `VITE_METAQUOTER_URL` | No | — | Metaquoter (swap quoting) service URL |
| `VITE_SWAP_WRAPPER_ADDRESS` | No | — | Swap wrapper contract address |

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Type-check and build for production |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | Run the TypeScript compiler without emitting |
| `npm run lint` | Lint with Biome |
| `npm run format` | Format with Biome |
| `npm run check` | Lint + format with autofix |
| `npm run test` | Run the test suite once |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with coverage |
| `npm run verify` | Typecheck, lint, and test (CI entry point) |

## Development

### Service proxies

The dev server proxies the following paths to local backend services, so relative service URLs (as in `.env.example`) work without CORS configuration:

| Path | Target |
| --- | --- |
| `/relayer` | `http://localhost:3003` |
| `/fmd` | `http://localhost:3001` |
| `/metaquoter` | `http://localhost:8081` |
| `/explorer` | `http://localhost:3002` |

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

Tests run with Vitest in a jsdom environment, using Testing Library for component tests. `npm run verify` runs the full quality gate: typecheck, Biome checks, and tests.

## Docker

The production image builds the app and serves it with nginx:

```bash
docker build \
  --secret id=npm_token,env=NODE_AUTH_TOKEN \
  --build-arg VITE_CHAIN_ID=... \
  --build-arg VITE_RPC_URL=... \
  --build-arg VITE_MASP_ADDRESS=... \
  --build-arg VITE_RELAYER_URL=... \
  --build-arg VITE_FMD_URL=... \
  --build-arg VITE_RELAYER_ADDRESS=... \
  --build-arg VITE_TREE_DEPTH=... \
  -t lelantos-wallet .
```

Environment variables are baked in at build time. The npm token secret is required to install `@lelantos-org` packages. The bundled [`nginx.conf`](nginx.conf) serves the SPA on port 80.
