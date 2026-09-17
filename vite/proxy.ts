import type { ProxyOptions } from "vite";

/// Forward `/<prefix>/*` to `target`, with the prefix stripped.
function strip(prefix: string, target: string): ProxyOptions {
  const re = new RegExp(`^/${prefix}`);
  return {
    target,
    changeOrigin: true,
    rewrite: (p) => p.replace(re, ""),
  };
}

/// Dev server proxy: every backend service under an app-origin prefix, so dev makes no CORS calls.
export function devProxy(env: NodeJS.ProcessEnv = process.env): Record<string, ProxyOptions> {
  return {
    "/registry": strip("registry", env.REGISTRY_PROXY_TARGET ?? "http://localhost:3005"),
    "/relayer": {
      ...strip("relayer", env.RELAYER_PROXY_TARGET ?? "http://localhost:3003"),
      // Disable buffering: /v1/intents/stream is SSE and never ends.
      configure: (proxy) => {
        proxy.on("proxyRes", (proxyRes) => {
          proxyRes.headers["x-accel-buffering"] = "no";
          delete proxyRes.headers["content-length"];
        });
      },
    },
    "/fmd": strip("fmd", "http://localhost:3001"),
    "/metaquoter": strip("metaquoter", "http://localhost:8081"),
    "/explorer": strip("explorer", "http://localhost:3002"),
    "/rpc": strip("rpc", "http://localhost:3006"),
  };
}
