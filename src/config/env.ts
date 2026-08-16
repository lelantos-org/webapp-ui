import { evmAddress } from "@lelantos-org/sdk";
import { toAbsoluteUrl } from "@lelantos-org/sdk/core";
import { z } from "zod";

// Branded at parse time, so every consumer holds an `EvmAddress`. The regex
// runs first to produce the friendlier message; `evmAddress` accepts exactly
// what it matches and therefore cannot throw here.
const ethAddress = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, "expected 0x-prefixed 20-byte hex")
  .transform(evmAddress);

const url = z.string().min(1, "required");

// An unset Docker build arg or CI variable reaches Vite as an empty string
// rather than as `undefined`. Blank therefore has to mean "absent", or
// declaring an optional setting without a value would fail validation and
// break boot instead of just leaving its feature switched off.
const blankAsAbsent = z
  .string()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : undefined));

/// Optional setting: absent, or valid per `schema`.
function opt<T extends z.ZodTypeAny>(schema: T) {
  return blankAsAbsent.pipe(schema.optional());
}

/// Optional setting that falls back to `fallback` when absent.
function withDefault(fallback: string) {
  return blankAsAbsent.transform((v) => v ?? fallback);
}

// Base URL of a backend service. Deployments point these at dev-server /
// nginx proxy paths (`/fmd`, `/relayer`), but the SDK's HTTP client and viem
// both build requests with `new URL(base + path)`, which throws on a
// page-relative base. Resolve against the page origin so both spellings work.
const serviceUrl = url.transform(toAbsoluteUrl);
const optServiceUrl = opt(z.string().transform(toAbsoluteUrl));

/// Exported for tests; `env` below is the parsed singleton.
export const Schema = z.object({
  chainId: withDefault("31337").transform((v) => BigInt(v)),
  chainName: withDefault("local"),
  rpcUrl: serviceUrl,
  maspAddress: opt(ethAddress),
  relayerUrl: serviceUrl,
  fmdUrl: serviceUrl,
  relayerAddress: ethAddress,
  permit2Address: opt(ethAddress),
  // `NativeAdapter` deployed alongside the pool. The MASP is ERC-20 only, so
  // without it native-ETH deposits and `withdrawEth` have no entry point and
  // the SDK reports them unsupported. Absent hides the "ETH (native)" option.
  nativeAdapterAddress: opt(ethAddress),
  treeDepth: withDefault("20").pipe(z.coerce.number().int().positive()),
  explorerUrl: opt(z.string()),
  explorerApiUrl: withDefault("/explorer").transform(toAbsoluteUrl),
  metaquoterUrl: optServiceUrl,
  swapWrapperAddress: opt(ethAddress),
});

export type Env = z.infer<typeof Schema>;

function parseEnv(): Env {
  const raw = {
    chainId: import.meta.env.VITE_CHAIN_ID,
    chainName: import.meta.env.VITE_CHAIN_NAME,
    rpcUrl: import.meta.env.VITE_RPC_URL,
    maspAddress: import.meta.env.VITE_MASP_ADDRESS,
    relayerUrl: import.meta.env.VITE_RELAYER_URL,
    fmdUrl: import.meta.env.VITE_FMD_URL,
    relayerAddress: import.meta.env.VITE_RELAYER_ADDRESS,
    permit2Address: import.meta.env.VITE_PERMIT2_ADDRESS,
    nativeAdapterAddress: import.meta.env.VITE_NATIVE_ADAPTER_ADDRESS,
    treeDepth: import.meta.env.VITE_TREE_DEPTH,
    explorerUrl: import.meta.env.VITE_EXPLORER_URL,
    explorerApiUrl: import.meta.env.VITE_EXPLORER_API_URL,
    metaquoterUrl: import.meta.env.VITE_METAQUOTER_URL,
    swapWrapperAddress: import.meta.env.VITE_SWAP_WRAPPER_ADDRESS,
  };
  const result = Schema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  VITE_${camelToScreaming(String(i.path[0] ?? ""))}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return Object.freeze(result.data);
}

function camelToScreaming(s: string): string {
  return s.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase();
}

export const env: Env = parseEnv();
