import { z } from "zod";
import {
  ENDPOINT_FIELDS,
  type EndpointField,
  type EndpointOverrides,
  readEndpointOverrides,
} from "./endpoints";
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

type Effective = Env & { rpcProxyUrl: string | undefined };

interface Snapshot {
  /// The build's own, which names no rpc-proxy.
  builtin: Effective;
  effective: Effective;
  overridden: readonly EndpointField[];
}

// Taken once: a tab keeps the endpoints it loaded with until it reloads, whatever another tab saves.
let snapshot: Snapshot | undefined;

// A URL that only repeats the build's is not a choice.
function withoutRepeats(overrides: EndpointOverrides, builtin: Effective): EndpointOverrides {
  const out: EndpointOverrides = {};
  for (const field of ENDPOINT_FIELDS) {
    const url = overrides[field];
    if (url !== undefined && url !== builtin[field]) out[field] = url;
  }
  return out;
}

function overlay(builtin: Effective): Snapshot {
  const chosen = withoutRepeats(readEndpointOverrides(), builtin);
  return {
    builtin,
    effective: Object.freeze({ ...builtin, ...chosen }),
    overridden: ENDPOINT_FIELDS.filter((field) => chosen[field] !== undefined),
  };
}

function read(): Snapshot {
  snapshot ??= overlay({ ...parseEnv(), rpcProxyUrl: undefined });
  return snapshot;
}

/// Parse the settings now, throwing `EnvConfigError` if the build's are invalid.
export function validateEnv(): void {
  read();
}

/// The settings in force: the build's, with the user's endpoint choices over them. Read lazily
/// so importing this module needs no page.
export const env: Effective = Object.freeze({
  get registryUrl() {
    return read().effective.registryUrl;
  },
  get relayerUrl() {
    return read().effective.relayerUrl;
  },
  get fmdUrl() {
    return read().effective.fmdUrl;
  },
  get metaquoterUrl() {
    return read().effective.metaquoterUrl;
  },
  /// The user's rpc-proxy, serving `/v1/<chainId>`; unset, each chain's registry row decides.
  get rpcProxyUrl() {
    return read().effective.rpcProxyUrl;
  },
});

/// What the build itself points at, whatever the user chose; nothing for the rpc-proxy.
export function builtinEndpoint(field: EndpointField): string | undefined {
  return read().builtin[field];
}

/// `overrides` less those that only repeat the build's, which are not choices.
export function customEndpoints(overrides: EndpointOverrides): EndpointOverrides {
  return withoutRepeats(overrides, read().builtin);
}

/// The endpoints the user's choice is in force for.
export function overriddenEndpoints(): readonly EndpointField[] {
  return read().overridden;
}

export function resetEnvForTest(): void {
  snapshot = undefined;
}
