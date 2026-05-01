import { z } from "zod";

const ethAddress = z.string().regex(/^0x[0-9a-fA-F]{40}$/, "expected 0x-prefixed 20-byte hex");

const url = z.string().min(1, "required");
const optUrl = z
  .string()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : undefined));

const Schema = z.object({
  chainId: z
    .string()
    .min(1)
    .default("31337")
    .transform((v) => BigInt(v)),
  chainName: z.string().default("local"),
  rpcUrl: url,
  maspAddress: ethAddress.optional(),
  relayerUrl: url,
  fmdUrl: url,
  relayerAddress: ethAddress,
  permit2Address: ethAddress.optional(),
  treeDepth: z
    .string()
    .default("20")
    .transform((v) => Number(v))
    .pipe(z.number().int().positive()),
  explorerUrl: optUrl,
  explorerApiUrl: z.string().min(1).default("/explorer"),
  metaquoterUrl: optUrl,
  swapWrapperAddress: ethAddress.optional(),
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
