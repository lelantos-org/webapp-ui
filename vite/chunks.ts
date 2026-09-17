/// Split vendor code into stable chunks that survive app-only deploys.
export function manualChunks(id: string): string | undefined {
  if (!id.includes("node_modules")) return undefined;
  if (id.includes("react-dom")) return "vendor-react";
  if (id.includes("/react/") || id.includes("react-router")) return "vendor-react";
  if (id.includes("@tanstack")) return "vendor-query";
  if (id.includes("react-hook-form") || id.includes("@hookform")) return "vendor-forms";
  // zod is eager (config/), so it must not share a chunk with react-hook-form.
  if (id.includes("zod")) return "vendor-zod";
  if (id.includes("sonner")) return "vendor-ui";
  return undefined;
}

/// Name a flow's route chunk after its folder (`shield-<hash>.js`); others keep Rollup's name.
export function chunkFileNames(chunk: { name: string; facadeModuleId: string | null }): string {
  const facade = chunk.facadeModuleId?.replaceAll("\\", "/");
  const dir = facade?.match(/\/src\/flows\/([^/]+)\/[^/]+\.tsx?$/)?.[1];
  return `assets/${dir ?? "[name]"}-[hash].js`;
}
