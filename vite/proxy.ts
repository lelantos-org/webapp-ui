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

/// The dev server's API routes: every backend service under its app-origin
/// prefix, so the browser never makes a cross-origin call in development.
export function devProxy(env: NodeJS.ProcessEnv = process.env): Record<string, ProxyOptions> {
  return {
    // registry-webserver. Same story as the relayer below: point
    // REGISTRY_PROXY_TARGET at a deployed one to develop against it.
    "/registry": strip("registry", env.REGISTRY_PROXY_TARGET ?? "http://localhost:3005"),
    "/relayer": {
      // Dev proxy target. Defaults to the local relayer; point
      // RELAYER_PROXY_TARGET at a deployed one (e.g.
      // https://relayer.lelantos.xyz) to develop against it. The proxy runs
      // server-side, so it sidesteps the deployed relayer's CORS policy,
      // which only allows the https://app.lelantos.xyz origin.
      ...strip("relayer", env.RELAYER_PROXY_TARGET ?? "http://localhost:3003"),
      // Stream SSE through without buffering. Default http-proxy stream
      // mode sometimes holds chunks until the body finishes — fatal for
      // /v1/intents/stream which never terminates. selfHandleResponse:
      // false (default) + this configure hook keep the chunks flowing.
      configure: (proxy) => {
        proxy.on("proxyRes", (proxyRes) => {
          proxyRes.headers["x-accel-buffering"] = "no";
          // Drop content-length if any sneaks in — SSE is chunked.
          delete proxyRes.headers["content-length"];
        });
      },
    },
    "/fmd": strip("fmd", "http://localhost:3001"),
    "/metaquoter": strip("metaquoter", "http://localhost:8081"),
    "/explorer": strip("explorer", "http://localhost:3002"),
    // rpc-proxy, which serves the SDK's own eth_call/eth_getLogs traffic.
    //
    // Proxied rather than reached directly for the reason every other
    // service here is: no backend crate carries a `CorsLayer`, so a
    // cross-origin `POST http://localhost:3006/v1/<chain>` fails preflight
    // with no `Access-Control-Allow-Origin` on the response. Same-origin
    // through here, there is no preflight to fail.
    //
    // The path this strips is deliberate: `read_rpc_url` in the dev
    // registry config is `/rpc/v1/<chain>`, matching the app-origin shape
    // prod publishes, and the proxy's own route is `/v1/{chain_id}`.
    "/rpc": strip("rpc", "http://localhost:3006"),
  };
}
