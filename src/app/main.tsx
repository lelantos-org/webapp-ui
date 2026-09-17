import "@/app/boot/polyfills";
// Must precede any other stylesheet: its `@layer` statement fixes the cascade order.
import "@/styles.css";
import React from "react";
import ReactDOM from "react-dom/client";
import { renderBootFailure } from "@/app/boot/boot-failure";
import { AppProviders } from "@/app/providers/providers";
import { App } from "@/app/routes/App";
import { validateEnv } from "@/config/env";
import { ensureWasm, prefetchWasm } from "@/config/wasm";
import { installConsoleFilter } from "@/shared/lib/logger";

function mountPoint(): HTMLElement {
  const root = document.getElementById("root");
  if (!root) throw new Error("index.html is missing its #root element");
  return root;
}

async function boot(root: HTMLElement): Promise<void> {
  // First, so a misconfigured deployment reaches the boot-failure screen.
  validateEnv();

  installConsoleFilter();
  ensureWasm();
  prefetchWasm();

  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <AppProviders>
        <App />
      </AppProviders>
    </React.StrictMode>,
  );
}

const root = mountPoint();
void boot(root).catch((e: unknown) => {
  console.error("boot failed", e);
  renderBootFailure(root, e instanceof Error ? e.message : String(e));
});
