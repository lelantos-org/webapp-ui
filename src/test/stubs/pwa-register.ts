// Stands in for `virtual:pwa-register/react`, which only a build with the PWA plugin provides.

export function useRegisterSW() {
  return { needRefresh: [false], updateServiceWorker: async () => {} };
}
