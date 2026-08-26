import { toAbsoluteUrl } from "@lelantos-org/sdk/core";
import { z } from "zod";

/// A service URL, checked for shape as well as presence.
///
/// Trimmed before the length check, since `" "` would otherwise pass and resolve
/// to the page origin — a valid URL pointing at the app itself, so every service
/// call 404s at runtime rather than failing at boot. The protocol check runs
/// after `toAbsoluteUrl`, so a page-relative value such as `/relayer` still
/// passes.
const url = z
  .string()
  .transform((v) => v.trim())
  .pipe(z.string().min(1, "required"));

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

const HTTP_URL_MESSAGE = "must resolve to an http(s) URL";

// An unset Docker build arg or CI variable reaches Vite as an empty string
// rather than `undefined`. Blank must therefore mean absent, or declaring an
// optional setting without a value would fail validation and break boot instead
// of leaving its feature switched off.
const blankAsAbsent = z
  .string()
  .optional()
  .transform((v) => {
    const t = v?.trim();
    return t ? t : undefined;
  });

/// Optional setting: absent, or valid per `schema`.
function opt<T extends z.ZodTypeAny>(schema: T) {
  return blankAsAbsent.pipe(schema.optional());
}

// Base URL of a backend service. Deployments point these at dev-server or nginx
// proxy paths (`/fmd`, `/relayer`), but the SDK's HTTP client and viem build
// requests with `new URL(base + path)`, which throws on a page-relative base.
// Resolving against the page origin makes both spellings work.
const serviceUrl = url.transform(toAbsoluteUrl).refine(isHttpUrl, HTTP_URL_MESSAGE);
const optServiceUrl = opt(z.string().transform(toAbsoluteUrl).refine(isHttpUrl, HTTP_URL_MESSAGE));

/// Settings global to the deployment. Exported for tests; `env` below is the
/// parsed singleton.
///
/// Everything per-chain — chain id and name, RPC, contract addresses, tree depth,
/// explorer — comes from the relayer's `/chains` at runtime, so one build serves
/// every deployment. What remains are the services themselves, which are shared
/// across chains and cannot be discovered from inside the app; `relayerUrl` is
/// the bootstrap that makes the rest discoverable.
export const Schema = z.object({
  relayerUrl: serviceUrl,
  fmdUrl: serviceUrl,
  /// Absent disables swaps rather than failing the boot.
  metaquoterUrl: optServiceUrl,
});

export type Env = z.infer<typeof Schema>;

/// Thrown when the deployment is misconfigured. Named so `main` can distinguish
/// it from a crash and report accordingly.
export class EnvConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnvConfigError";
  }
}

function parseEnv(): Env {
  const raw = {
    relayerUrl: import.meta.env.VITE_RELAYER_URL,
    fmdUrl: import.meta.env.VITE_FMD_URL,
    metaquoterUrl: import.meta.env.VITE_METAQUOTER_URL,
  };
  const result = Schema.safeParse(raw);
  if (!result.success) {
    // `i.path[0]` is empty for an issue raised inside a piped optional schema,
    // which would otherwise produce a bare `VITE_:` label naming no field.
    const issues = result.error.issues
      .map((i) => {
        const field = String(i.path[0] ?? "");
        const name = field ? `VITE_${camelToScreaming(field)}` : "configuration";
        return `  ${name}: ${i.message}`;
      })
      .join("\n");
    throw new EnvConfigError(`Invalid environment configuration:\n${issues}`);
  }
  return Object.freeze(result.data);
}

function camelToScreaming(s: string): string {
  return s.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase();
}

export const env: Env = parseEnv();
