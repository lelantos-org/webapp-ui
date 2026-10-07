import { useState } from "react";
import { useLocation } from "react-router-dom";
import { handleInFragment } from "./handle-fragment";

/// The layout's skip link, which rewrites the fragment when it is followed.
const SKIP_ANCHOR = "#main";

/// The handle the URL fragment names, as written. It follows the address bar, except onto the skip
/// link's anchor: `#main` names a profile only when the page opens on it.
export function useHandleFragment(): string {
  const { hash } = useLocation();
  const [shown, setShown] = useState(hash);
  if (hash !== shown && hash !== SKIP_ANCHOR) setShown(hash);
  return handleInFragment(shown);
}
