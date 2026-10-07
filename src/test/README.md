# Tests

Tests sit next to the code they cover. The file name picks the environment:

| File                       | Project   | Runs in | Use for                                                        |
| -------------------------- | --------- | ------- | -------------------------------------------------------------- |
| `x.test.ts`                | `unit`    | node    | Pure logic: models, parsers, copy, math                        |
| `x.dom.test.ts` / `.tsx`   | `dom`     | jsdom   | Renders, hooks, `window`, `localStorage`, anything that reads `env` |
| `x.app.test.tsx`           | `app`     | jsdom   | Journeys through the whole app: real providers, routes and shell |
| `vite/**/x.test.ts`        | `tooling` | node    | Build plugins                                                  |

```sh
npm test                 # everything
npm run test:unit        # one project (unit also skips per-file isolation)
npm run test:dom
npm run test:app
npm run test:watch
npx vitest run src/flows/send   # one directory
```

Start with `x.test.ts`. If the suite fails with `document is not defined`,
`localStorage is not defined` or `EnvConfigError … must resolve to an http(s)
URL`, it needs the browser: rename it to `x.dom.test.ts`. Importing
`config/env` is fine in node, because it is parsed on first read. Only code
that reads a service URL while the test runs needs `dom`, since the URLs
resolve against `location`.

The config resets spies (`restoreMocks`), globals (`unstubGlobals`) and env
between tests, and the setup files restore real timers and, in `dom`, empty
`localStorage` and `sessionStorage`. So a test needs no teardown for `vi.fn`,
`vi.spyOn`, `vi.stubGlobal`, `vi.stubEnv`, `vi.useFakeTimers` or anything it
stored. A store that keeps state in memory still needs its own reset
(`resetOpsForTest`, a record store's `resetForTest`).

Every project isolates its files. Seven `unit` files use `vi.mock`, and without
isolation a mock loses to whichever file loaded the real module first.

## What is here

Import each module by its own path. There is no barrel, so loading one helper
never loads a module a test is mocking.

| Module                  | What it gives you                                                     |
| ----------------------- | --------------------------------------------------------------------- |
| `app.tsx`               | `renderApp(ui, options)`, `renderAppHook(hook, options)`: the app's providers, with the chain and wallet a test names |
| `render.tsx`            | `appWrapper`, `appWrapperAt(entry)`, `routerWrapper`, `queryWrapper`, `withQueryClient`, `createTestQueryClient`, `renderQueryHook` |
| `interact.ts`           | `fill(label, value)`, `press(name)`, `pressAndSettle(name)`           |
| `spies.ts`              | `lastArg(spy, index?)`: what a stub was last asked                    |
| `async.ts`              | `deferred()`: hold a promise open across assertions                   |
| `boot.tsx`              | `bootApp(options)`, `newUser(options)`, `returningUser(options)`: the whole app, for `app` journeys |
| `http.ts`               | `stubFetch(handler)`, `stubFetchRoutes({ path: body or handler })`, `jsonResponse` |
| `browser.ts`            | `stubReducedMotion`, `stubWebAuthn`                                   |
| `privacy.ts`            | `hideAmounts()`: privacy mode on until the test ends                  |
| `endpoints.ts`          | `chooseEndpoints(overrides)`: user-chosen service URLs in force until the test ends |
| `result.ts`             | `unwrap(result)`                                                      |
| `fixtures/assets.ts`    | `makeAsset(id, symbol, over)`, `USDC_ASSET`                           |
| `fixtures/chains.ts`    | `makeChain(over)`                                                     |
| `fixtures/addresses.ts` | `hexAddress("11")`, `hexBytes32("ab")`, `SHIELDED_ADDRESS`            |
| `fixtures/prices.ts`    | `priceMap`, `yieldGain`                                               |
| `fixtures/registry.ts`  | The registry and relayer `/chains` bodies                             |
| `fixtures/governance.ts`| Governance API rows                                                   |
| `fakes/chain.ts`        | `activeChainHooks(chain)`: the whole `@/features/chain` a form reads  |
| `fakes/wallet.ts`       | `spendFormWalletHooks`, and the wallet `testing` entry's builders     |
| `fakes/assets.ts`       | `assetReads(() => config)`: registry, balances, prices, select options |
| `fakes/fees.ts`         | `idleFeePanel(over)`, `blankFeeChrome()`                              |
| `fakes/operation.ts`    | `fakeActionMutation(mutateAsync)`, `idleProgress()`                   |
| `fakes/eip6963.ts`      | `detail`, `announce`: wallet discovery events. `installWallet`: an extension that answers the handshake and emits provider events |
| `stubs/pwa-register.ts` | What `virtual:pwa-register/react` resolves to under vitest            |

Fixtures are data. Fakes stand in for a feature's hooks inside `vi.mock`. Both
are typed against the app, so when a shape changes the compiler flags the fake
before a test can pass against the wrong one.

A feature that owns a React context also has a test-only entry beside its
barrel, which `scripts/check-imports.mjs` keeps out of the app:

| Entry                       | What it gives you                                                 |
| --------------------------- | ----------------------------------------------------------------- |
| `@/features/chain/testing`  | `ChainTestProvider`                                               |
| `@/features/wallet/testing` | `WalletTestProvider`, `fakeWalletContext`, `fakeWalletApi`, `connectedWalletApi`, `stubWalletBuild`, `ALL_CAPABILITIES`, `deniedCapabilities` |

## Recipes

### Pure logic (`unit`)

```ts
import { describe, expect, it } from "vitest";
import { makeAsset } from "@/test/fixtures/assets";
import { feeLine } from "./fee-copy";

describe("feeLine", () => {
  it("names the asset", () => {
    expect(feeLine(model(makeAsset(1n, "WETH")))).toContain("WETH");
  });
});
```

### A query hook (`dom`)

```ts
import { waitFor } from "@testing-library/react";
import { stubFetch } from "@/test/http";
import { renderQueryHook } from "@/test/render";

it("reads the head", async () => {
  const fetch = stubFetch({ chainId: 31337, maxNoteId: 12, maxNullifierSeq: 4 });
  const { result } = renderQueryHook(() => useSyncHead());
  await waitFor(() => expect(result.current).toBe("12:4"));
  expect(fetch).toHaveBeenCalledOnce();
});
```

### Anything that reads the chain or the wallet (`dom`)

`renderApp` and `renderAppHook` mount the providers `AppProviders` nests, with
the chain and wallet contexts answering what the test says. `useActiveChain`,
`useChainRegistry`, `useTxExplorerUrl`, `useRegisteredAssets`, `useWallet` and
`useWalletInstance` then run for real, so `@/features/chain` needs no `vi.mock`,
and `@/features/wallet` needs one only for what is not a context read.

```ts
import { waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { fakeWalletApi } from "@/features/wallet/testing";
import { renderAppHook } from "@/test/app";

const quoteFee = vi.fn(async () => ({ charged: false, options: [] }));
const session = { wallet: fakeWalletApi({ address: "lelantos1me", quoteFee }) };

it("re-quotes for another account", async () => {
  const { result, setApp } = renderAppHook(() => useFeeQuote("transfer"), {
    chain: { chainId: 1n },
    wallet: session,
  });
  await waitFor(() => expect(result.current.data).toBeDefined());

  setApp({ wallet: { wallet: fakeWalletApi({ address: "lelantos1else", quoteFee }) } });
  await waitFor(() => expect(quoteFee).toHaveBeenCalledTimes(2));
});
```

| Option     | Default                | Meaning                                              |
| ---------- | ---------------------- | ---------------------------------------------------- |
| `chain`    | `makeChain()`          | Overrides for `makeChain`, or `null` for no chain    |
| `registry` | the active chain alone | The chains served                                    |
| `wallet`   | disconnected           | Overrides for `fakeWalletContext`                    |
| `route`    | `/`                    | Where the router opens                               |
| `client`   | a fresh one            | A query client the test holds                        |

`setApp` takes `chain`, `registry` and `wallet`, and changes them in `act`, as a
wallet or network switch does.

### A journey through the whole app (`app`)

`bootApp` mounts `AppProviders` and `App` as a page load does. `ChainProvider`,
`WalletProvider`, the wallet stores, the router and every lazy screen are the
real ones. Three things are stood in for, each at the edge of the app:

- **The network**: a route table (`stubFetchRoutes`) serving the registry, the
  relayer and health. `chains`, `assets` and `routes` change it.
- **The wallet extension**: `installWallet`, an EIP-6963 provider. `emit` fires
  `accountsChanged`, `chainChanged` and `disconnect`.
- **The SDK wallet**: `stubWalletBuild` replaces the build, so no worker, prover
  or IndexedDB store starts. `newUser` and `returningUser` set both up.

```tsx
import { act, screen } from "@testing-library/react";
import { bootApp, returningUser } from "@/test/boot";

it("rebuilds the wallet for the network the extension moves to", async () => {
  const { extension, build } = returningUser();
  bootApp({ chains: [31337, 8453] });
  await screen.findByText("Shielded balance");

  act(() => extension.emit("chainChanged", "0x2105"));

  expect(await screen.findByTitle("chain id 8453")).toBeInTheDocument();
  expect(build).toHaveBeenCalledTimes(2);
});
```

Wait with `findBy…` or `waitFor`, never a sleep. A screen is remounted as the
welcome card fades out, so query again inside `waitFor` when asserting on one
that has only just appeared. For a retry or a timeout, use
`vi.useFakeTimers({ shouldAdvanceTime: true })` and advance the clock in `act`.

Keep a journey to what only the assembled app can show: connection, network,
routing. A form's rules belong in its own `dom` test.

### A form, with its feature boundaries mocked (`dom`)

The form and its own hooks stay real, and the chain comes from `renderApp`. What
a feature reads from the SDK or the network is replaced at the barrel.

```tsx
import { vi } from "vitest";
import { renderApp } from "@/test/app";
import { fakeActionMutation } from "@/test/fakes/operation";
import { makeAsset } from "@/test/fixtures/assets";
import { fill, pressAndSettle } from "@/test/interact";
import { lastArg } from "@/test/spies";
import { TransferForm } from "./TransferForm";

const WETH = makeAsset(1n, "WETH");
const mutateAsync = vi.fn(async (_: unknown) => ({ txHash: "0x1" }));

vi.mock("@/features/assets", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/assets")>()),
  ...(await import("@/test/fakes/assets")).assetReads(() => ({ assets: [WETH], balance: 5n })),
}));
vi.mock("@/features/wallet", async () =>
  (await import("@/test/fakes/wallet")).spendFormWalletHooks(),
);
vi.mock("./use-transfer", () => ({ useTransfer: () => fakeActionMutation(mutateAsync) }));

it("sends what was reviewed", async () => {
  renderApp(<TransferForm />, { chain: { chainId: 1n } });
  fill("You send", "0.5");
  await pressAndSettle("Review");
  await pressAndSettle("Confirm and send");
  expect(lastArg(mutateAsync)).toMatchObject({ amount: 500_000n });
});
```

A factory that replaces part of a module says so, so the compiler checks each
member against the real one:

```ts
vi.mock("@/features/wallet", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/wallet")>()),
  ...({
    useInvalidateWalletState: () => invalidate,
  } satisfies Partial<typeof import("@/features/wallet")>),
}));
```

### The one rule for `vi.mock`

Vitest hoists `vi.mock` above the imports, so the **factory body** runs before
the test file's imports and constants exist:

- **In the factory body** (a spread, a value computed right away), load a helper
  with `await import("@/test/…")`. A static import or a file constant there
  throws `Cannot access '…' before initialization`.
- **Inside a hook the factory returns** (`useX: () => …`), anything goes: static
  imports, file constants, `vi.fn`s declared below. The hook runs at render time,
  after the whole file has loaded.

So `assetReads` takes a function (`() => ({ assets: [WETH] })`): it is spread in
the factory body, and reads `WETH` later, when a hook runs.

### Recording what a stub was asked

Use a `vi.fn(impl)` and read it with `lastArg`. Don't keep a hand-rolled array.
`restoreMocks` clears the calls before every test.

```ts
const useFeePanel = vi.fn((_: PanelInputs) => idleFeePanel());
vi.mock("@/features/fees", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/fees")>()),
  useFeePanel: (i: PanelInputs) => useFeePanel(i),
}));

expect(lastArg(useFeePanel).feeAsset).toBe(DAI.id);
```

### State a test changes between cases

For a value a mock reads and each case sets, use a `let` or a `vi.hoisted`
object at module scope, reset in `beforeEach`. Read it only inside the hooks the
factory returns.
