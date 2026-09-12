// Stamps an explicitly chosen theme on <html> before first paint.
//
// Only when there IS a choice. With none, the attribute stays off and the CSS
// `prefers-color-scheme` block decides — which means the app keeps following the
// OS live, including a change made while it is open. Stamping a resolved value
// here would freeze it at boot instead.
//
// An external file rather than an inline <script>: the production CSP is
// `script-src 'self' 'wasm-unsafe-eval'` with no 'unsafe-inline', so an inline
// block would work in dev and be blocked in the built app. Same-origin and
// render-blocking gets the same result without weakening the policy — see the
// note above the CSP meta in index.html.
//
// Kept in public/ rather than src/ so it is not bundled: a deferred module would
// run after first paint, which is the flash this exists to prevent.
(function () {
  try {
    var stored = localStorage.getItem("lelantos:theme");
    if (stored !== "light" && stored !== "dark") return;
    document.documentElement.setAttribute("data-theme", stored);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", stored === "light" ? "#F7F4ED" : "#14110E");
  } catch (e) {
    // Blocked storage (private mode, site data off) must not stop the app
    // booting; the CSS default already covers this case.
  }
})();
