/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />
/// <reference types="vite-plugin-pwa/react" />

/// Short commit the bundle was built from; substituted by `define` in
/// vite.config.ts. `"dev"` when the build had no repository to ask.
declare const __COMMIT__: string;

// `process` npm package has no @types; declare it as the Node.js global type.
declare module "process" {
    export = process;
}
