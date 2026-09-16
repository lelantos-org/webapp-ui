import "@/app/boot/polyfills";
// First, before any module that could bring a stylesheet of its own: its opening
// `@layer` statement is what fixes the cascade order. See `styles.css`.
import "@/styles.css";
import React from "react";
import ReactDOM from "react-dom/client";
import { renderBootFailure } from "@/app/boot/boot-failure";
import { AppProviders } from "@/app/providers/providers";
import { App } from "@/app/routes/App";
import { ensureWasm, prefetchWasm } from "@/config/wasm";
import { installConsoleFilter } from "@/shared/lib/logger";

function mountPoint(): HTMLElement {
  const root = document.getElementById("root");
  if (!root) throw new Error("index.html is missing its #root element");
  return root;
}

async function boot(root: HTMLElement): Promise<void> {
  // Imported dynamically so a configuration error surfaces as a rejection this
  // function can catch, rather than as a throw during *this* module's own
  // evaluation — which no code here would be running to handle.
  await import("@/config/env");

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
  // Direct `console`, because `installConsoleFilter` may not have run yet.
  console.error("boot failed", e);
  renderBootFailure(root, e instanceof Error ? e.message : String(e));
});
