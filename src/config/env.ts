import { toAbsoluteUrl } from "@lelantos-org/sdk/core";
import { z } from "zod";

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

// Base URL of a backend service. Deployments point these at dev-server /
// nginx proxy paths (`/fmd`, `/relayer`), but the SDK's HTTP client and viem
// both build requests with `new URL(base + path)`, which throws on a
// page-relative base. Resolve against the page origin so both spellings work.
const serviceUrl = url.transform(toAbsoluteUrl);
const optServiceUrl = opt(z.string().transform(toAbsoluteUrl));

/// Exported for tests; `env` below is the parsed singleton.
/// Only what is global to the deployment.
///
/// Everything per-chain — chain id and name, RPC, contract addresses, tree
/// depth, explorer — comes from the relayer's `/chains` at runtime, so one
/// build serves every deployment. These three are what remain: the services
/// themselves, which are shared across chains and cannot be discovered from
/// inside the app. `relayerUrl` in particular is the bootstrap that makes the
/// rest discoverable.
export const Schema = z.object({
  relayerUrl: serviceUrl,
  fmdUrl: serviceUrl,
  /// Absent disables swaps rather than failing the boot.
  metaquoterUrl: optServiceUrl,
});

export type Env = z.infer<typeof Schema>;

function parseEnv(): Env {
  const raw = {
    relayerUrl: import.meta.env.VITE_RELAYER_URL,
    fmdUrl: import.meta.env.VITE_FMD_URL,
    metaquoterUrl: import.meta.env.VITE_METAQUOTER_URL,
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
