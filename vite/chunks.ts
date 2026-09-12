/// Split vendor code into stable, parallel-loadable chunks. Improves
/// cache hit rate across deploys (app churn doesn't invalidate vendor
/// bundles) and lets the browser fetch them concurrently.
export function manualChunks(id: string): string | undefined {
  if (!id.includes("node_modules")) return undefined;
  if (id.includes("react-dom")) return "vendor-react";
  if (id.includes("/react/") || id.includes("react-router")) return "vendor-react";
  if (id.includes("@tanstack")) return "vendor-query";
  if (id.includes("react-hook-form") || id.includes("@hookform")) return "vendor-forms";
  // zod must NOT share a chunk with react-hook-form. `config/env.ts`
  // and `config/chains/` import zod eagerly, so grouping them would make
  // the entry chunk pull in react-hook-form + resolvers — code only
  // the lazy route components ever touch.
  if (id.includes("zod")) return "vendor-zod";
  if (id.includes("sonner")) return "vendor-ui";
  return undefined;
}

/// Name a route chunk after its flow.
///
/// Each flow is loaded through its screen module (see `src/flows/loaders.ts`),
/// and Rollup would name the chunk after that file — `DepositForm-<hash>.js`. The
/// flow's folder is the name that matches the route: `shield-<hash>.js`. Every
/// other chunk keeps Rollup's own name.
export function chunkFileNames(chunk: { name: string; facadeModuleId: string | null }): string {
  const facade = chunk.facadeModuleId?.replaceAll("\\", "/");
  const dir = facade?.match(/\/src\/flows\/([^/]+)\/[^/]+\.tsx?$/)?.[1];
  return `assets/${dir ?? "[name]"}-[hash].js`;
}
