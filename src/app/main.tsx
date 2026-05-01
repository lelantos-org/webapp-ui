import "@/app/polyfills";
import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "@/app/App";
import { AppProviders } from "@/app/providers";
import { ensureWasm, prefetchWasm } from "@/config/wasm";
import { installConsoleFilter } from "@/shared/lib/logger";
import "@/styles.css";

installConsoleFilter();
ensureWasm();
prefetchWasm();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppProviders>
      <App />
    </AppProviders>
  </React.StrictMode>,
);
