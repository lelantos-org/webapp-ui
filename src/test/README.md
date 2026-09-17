# Tests

Tests sit next to the code they cover. The file name picks the environment:

| File                       | Project   | Runs in | Use for                                                        |
| -------------------------- | --------- | ------- | -------------------------------------------------------------- |
| `x.test.ts`                | `unit`    | node    | Pure logic: models, parsers, copy, math                        |
| `x.dom.test.ts` / `.tsx`   | `dom`     | jsdom   | Renders, hooks, `window`, `localStorage`, anything that reads `env` |
| `vite/**/x.test.ts`        | `tooling` | node    | Build plugins                                                  |

```sh
npm test                 # everything
npm run test:unit        # one project (unit also skips per-file isolation)
npm run test:dom
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
between tests, so a test needs no teardown for `vi.fn`, `vi.spyOn`,
`vi.stubGlobal` or `vi.stubEnv`.

## What is here

Import each module by its own path. There is no barrel, so loading one helper
never loads a module a test is mocking.

| Module                  | What it gives you                                                     |
| ----------------------- | --------------------------------------------------------------------- |
| `render.tsx`            | `appWrapper`, `routerWrapper`, `queryWrapper`, `withQueryClient`, `createTestQueryClient`, `renderQueryHook` |
| `interact.ts`           | `fill(label, value)`, `press(name)`, `pressAndSettle(name)`           |
| `spies.ts`              | `lastArg(spy, index?)`: what a stub was last asked                    |
| `async.ts`              | `deferred()`: hold a promise open across assertions                   |
| `http.ts`               | `stubFetch(handler)`, `stubFetchRoutes({ path: body })`, `jsonResponse` |
| `browser.ts`            | `stubReducedMotion`, `stubWebAuthn`                                   |
| `result.ts`             | `unwrap(result)`                                                      |
| `fixtures/assets.ts`    | `makeAsset(id, symbol, over)`, `USDC_ASSET`                           |
| `fixtures/chains.ts`    | `makeChain(over)`                                                     |
| `fixtures/addresses.ts` | `hexAddress("11")`, `hexBytes32("ab")`                                |
| `fixtures/prices.ts`    | `priceMap`, `yieldGain`                                               |
| `fixtures/registry.ts`  | The registry and relayer `/chains` bodies                             |
| `fixtures/governance.ts`| Governance API rows                                                   |
| `fakes/chain.ts`        | `activeChainHooks(chain)`: the whole `@/features/chain` a form reads  |
| `fakes/wallet.ts`       | `fakeWalletContext`, `fakeWalletApi`, `ALL_CAPABILITIES`, `deniedCapabilities`, `spendFormWalletHooks` |
| `fakes/assets.ts`       | `assetReads(() => config)`: registry, balances, prices, select options |
| `fakes/fees.ts`         | `idleFeePanel(over)`, `blankFeeChrome()`                              |
| `fakes/operation.ts`    | `fakeActionMutation(mutateAsync)`, `idleProgress()`                   |
| `fakes/eip6963.ts`      | `detail`, `announce`: wallet discovery events                         |

Fixtures are data. Fakes stand in for a feature's hooks inside `vi.mock`. Both
are typed against the app, so when a shape changes the compiler flags the fake
before a test can pass against the wrong one.

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

### A form, with its feature boundaries mocked (`dom`)

The form and its own hooks stay real. Every feature it reads from is replaced at
the barrel.

```tsx
import { render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { fakeActionMutation } from "@/test/fakes/operation";
import { makeAsset } from "@/test/fixtures/assets";
import { fill, pressAndSettle } from "@/test/interact";
import { appWrapper } from "@/test/render";
import { lastArg } from "@/test/spies";
import { TransferForm } from "./TransferForm";

const WETH = makeAsset(1n, "WETH");
const mutateAsync = vi.fn(async (_: unknown) => ({ txHash: "0x1" }));

vi.mock("@/features/assets", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/assets")>()),
  ...(await import("@/test/fakes/assets")).assetReads(() => ({ assets: [WETH], balance: 5n })),
}));
vi.mock("@/features/chain", async () =>
  (await import("@/test/fakes/chain")).activeChainHooks({ chainId: 1n }),
);
vi.mock("@/features/wallet", async () =>
  (await import("@/test/fakes/wallet")).spendFormWalletHooks(),
);
vi.mock("./use-transfer", () => ({ useTransfer: () => fakeActionMutation(mutateAsync) }));

it("sends what was reviewed", async () => {
  render(<TransferForm />, { wrapper: appWrapper });
  fill("You send", "0.5");
  await pressAndSettle("Review");
  await pressAndSettle("Confirm and send");
  expect(lastArg(mutateAsync)).toMatchObject({ amount: 500_000n });
});
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
