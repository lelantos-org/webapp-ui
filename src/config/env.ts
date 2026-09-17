import { z } from "zod";
import { httpUrl } from "./url";

const url = z
  .string()
  .transform((v) => v.trim())
  .pipe(z.string().min(1, "required"));

// Unset Docker/CI build args arrive as "", which must mean absent.
const blankAsAbsent = z
  .string()
  .optional()
  .transform((v) => {
    const t = v?.trim();
    return t ? t : undefined;
  });

function opt<T extends z.ZodTypeAny>(schema: T) {
  return blankAsAbsent.pipe(schema.optional());
}
const serviceUrl = url.pipe(httpUrl);
const optServiceUrl = opt(httpUrl);

/// Deployment-wide service URLs; per-chain settings are discovered at runtime.
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

let parsed: Env | undefined;

function read(): Env {
  parsed ??= parseEnv();
  return parsed;
}

/// Parse the settings now, throwing `EnvConfigError` if they are invalid.
export function validateEnv(): void {
  read();
}

/// The parsed settings, read lazily so importing this module needs no page.
export const env: Env = Object.freeze({
  get registryUrl() {
    return read().registryUrl;
  },
  get relayerUrl() {
    return read().relayerUrl;
  },
  get fmdUrl() {
    return read().fmdUrl;
  },
  get metaquoterUrl() {
    return read().metaquoterUrl;
  },
});
