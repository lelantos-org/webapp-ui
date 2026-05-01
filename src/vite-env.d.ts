/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

// `process` npm package has no @types; declare it as the Node.js global type.
declare module "process" {
    export = process;
}
