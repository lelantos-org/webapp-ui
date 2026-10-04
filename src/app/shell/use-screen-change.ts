import { useEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";
import { screenTitle } from "@/app/routes/titles";

/// What a full page load does and a client-side route change does not: names the screen in the
/// title, starts it at the top, and moves focus to the content so a screen reader announces it.
/// Back and forward keep the scroll position the browser restores.
export function useScreenChange(): void {
  const { pathname } = useLocation();
  const navigation = useNavigationType();
  const loaded = useRef(false);

  useEffect(() => {
    document.title = screenTitle(pathname);
    // The first screen is a page load: the browser has done the rest.
    if (!loaded.current) {
      loaded.current = true;
      return;
    }
    if (navigation !== "POP") window.scrollTo(0, 0);
    document.getElementById("main")?.focus({ preventScroll: true });
  }, [pathname, navigation]);
}
