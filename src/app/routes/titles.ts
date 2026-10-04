import { matchPath } from "react-router-dom";
import { ACTIONS } from "./routes";

const APP = "Lelantos Wallet";

/// The claim page is routed outside the action table.
const CLAIM = { path: "/claim", title: "Claim" };

/// The document title for `pathname`: the screen's name ahead of the app's, or the app's alone.
export function screenTitle(pathname: string): string {
  // First match wins, as in `<Routes>`: `/governance/new` is listed ahead of `/governance/:id`.
  const screen = [...ACTIONS, CLAIM].find((route) => matchPath(route.path, pathname));
  return screen ? `${screen.title} · ${APP}` : APP;
}
