import { type Mock, vi } from "vitest";

export function jsonResponse(body: unknown, init: { status?: number } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json" },
  });
}

type Handler = (url: string, init?: RequestInit) => unknown;

/// Stub `fetch` with `handler` (a non-`Response` return is a 200 JSON body) or a fixed value.
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

/// Stub `fetch` per pathname: a 200 JSON body, a `Response`, or a handler asked on every call.
/// Any other path is a 404.
export function stubFetchRoutes(routes: Record<string, unknown>) {
  return stubFetch((url, init) => {
    const route = routes[new URL(url, "http://localhost").pathname];
    const body = typeof route === "function" ? (route as Handler)(url, init) : route;
    if (body === undefined) return jsonResponse({}, { status: 404 });
    // A `Response` is read once, and a route answers many calls.
    return body instanceof Response ? body.clone() : body;
  });
}
