/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />
/// <reference types="vite-plugin-pwa/react" />

/// Short commit the bundle was built from, or `"dev"`.
declare const __COMMIT__: string;

declare module "process" {
    export = process;
}
