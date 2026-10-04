// Stamps an explicitly chosen theme on <html> before first paint. With no stored
// choice the attribute stays off and the CSS `prefers-color-scheme` block
// decides, so the app follows the OS live.
//
// An external file because the production CSP is
// `script-src 'self' 'wasm-unsafe-eval'` with no 'unsafe-inline'. Kept in public/
// so it is not bundled: a deferred module would run after first paint. The build
// ships it under a hashed name (`hashedPublicScript`).
(function () {
  try {
    var stored = localStorage.getItem("lelantos:theme");
    if (stored !== "light" && stored !== "dark") return;
    document.documentElement.setAttribute("data-theme", stored);
    // Every tag, the OS-conditional one included: the choice overrides the OS.
    var metas = document.querySelectorAll('meta[name="theme-color"]');
    for (var i = 0; i < metas.length; i++) {
      metas[i].setAttribute("content", stored === "light" ? "#F7F4ED" : "#14110E");
    }
  } catch (e) {
    // Blocked storage (private mode, site data off) must not stop the app
    // booting; the CSS default covers this case.
  }
})();
