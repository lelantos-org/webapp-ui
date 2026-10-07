import { matchPath } from "react-router-dom";
import { ACTIONS, STANDALONE } from "./routes";

const APP = "Lelantos Wallet";

/// The document title for `pathname`: the screen's name ahead of the app's, or the app's alone.
export function screenTitle(pathname: string): string {
  // First match wins, as in `<Routes>`: `/governance/new` is listed ahead of `/governance/:id`.
  const screen = [...ACTIONS, ...STANDALONE].find((route) => matchPath(route.path, pathname));
  return screen ? `${screen.title} · ${APP}` : APP;
}
