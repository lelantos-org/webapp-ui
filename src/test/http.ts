import { type Mock, vi } from "vitest";

/// A real `Response` carrying `body` as JSON.
export function jsonResponse(body: unknown, init: { status?: number } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json" },
  });
}

type Handler = (url: string, init?: RequestInit) => unknown;

/// Stub `fetch` with `handler` (a non-`Response` return is a 200 JSON body) or a fixed value.
/// Returns the spy.
export function stubFetch(
  handler: Handler | object,
): Mock<(url: string, init?: RequestInit) => Promise<Response>> {
  const answer: Handler = typeof handler === "function" ? (handler as Handler) : () => handler;
  const spy = vi.fn(async (url: string, init?: RequestInit) => {
    const out = await answer(String(url), init);
    return out instanceof Response ? out : jsonResponse(out);
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

/// Stub `fetch` with a 200 JSON body per pathname; any other path is a 404.
export function stubFetchRoutes(routes: Record<string, unknown>) {
  return stubFetch((url) => {
    const body = routes[new URL(url, "http://localhost").pathname];
    return body === undefined ? jsonResponse({}, { status: 404 }) : body;
  });
}
