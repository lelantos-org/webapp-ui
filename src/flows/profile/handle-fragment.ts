/// The handle a profile URL's hash carries, as written; empty when it carries none.
export function handleInFragment(hash: string): string {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  try {
    return decodeURIComponent(raw).trim();
  } catch {
    return raw.trim();
  }
}
