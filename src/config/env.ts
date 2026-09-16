import { z } from "zod";
import { httpUrl } from "./url";

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
// Resolving against the page origin makes both spellings work — see `httpUrl`,
// which the per-chain URLs in `config/chains/schema.ts` are checked with too.
const serviceUrl = url.pipe(httpUrl);
const optServiceUrl = opt(httpUrl);

/// Settings global to the deployment. Exported for tests; `env` below is the
/// parsed singleton.
///
/// Everything per-chain — chain id and name, RPC, contract addresses, tree depth,
/// explorer — is discovered at runtime, so one build serves every deployment.
/// What remains are the services themselves, which are shared across chains and
/// cannot be discovered from inside the app.
///
/// Two of them are the bootstrap, and both are required. `registryUrl` describes
/// what each chain *is* — the deployment's own account of itself — and
/// `relayerUrl` says what one relayer will do on it. Neither is derivable from
/// the other, and the app cross-checks the two before trusting a chain, so a
/// deployment that sets only one has no usable network rather than a degraded
/// one; failing at boot says so where a silent fallback would not.
export const Schema = z.object({
  registryUrl: serviceUrl,
  relayerUrl: serviceUrl,
  fmdUrl: serviceUrl,
  /// Absent disables swaps rather than failing the boot.
  metaquoterUrl: optServiceUrl,
});

type Env = z.infer<typeof Schema>;

/// Thrown when the deployment is misconfigured.
class EnvConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnvConfigError";
  }
}

function parseEnv(): Env {
  const raw = {
    registryUrl: import.meta.env.VITE_REGISTRY_URL,
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
