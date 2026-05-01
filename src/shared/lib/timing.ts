/// For fixed-duration UI transitions — not polling or retries.
export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
