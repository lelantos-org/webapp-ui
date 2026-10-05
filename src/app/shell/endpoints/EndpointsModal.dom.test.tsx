import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { beginOp, opKey, opScope, resetOpsForTest } from "@/features/tx";
import { reloadPage } from "@/shared/lib/reload";
import { fill, press } from "@/test/interact";
import { queryWrapper } from "@/test/render";
import { EndpointsModal } from "./EndpointsModal";

vi.mock("@/shared/lib/reload", () => ({ reloadPage: vi.fn() }));

const KEY = "lelantos:endpoints:v1";
const SAVE = "Save and reload";

const stored = () => JSON.parse(localStorage.getItem(KEY) ?? "null") as unknown;

function open() {
  const onClose = vi.fn();
  render(<EndpointsModal onClose={onClose} />, { wrapper: queryWrapper });
  return onClose;
}

beforeEach(() => {
  vi.mocked(reloadPage).mockClear();
});

afterEach(() => {
  localStorage.removeItem(KEY);
  // The modal is still mounted here, and subscribed to the op store.
  act(() => resetOpsForTest());
});

describe("EndpointsModal", () => {
  it("shows what an empty field falls back to", () => {
    open();
    expect(screen.getByLabelText("Registry")).toHaveAttribute(
      "placeholder",
      new URL("/registry", location.href).href,
    );
    expect(screen.getByLabelText("RPC proxy")).toHaveAttribute(
      "placeholder",
      "set by the registry",
    );
    expect(screen.getByLabelText("Note feed")).toHaveValue("");
  });

  it("stores the services entered and reloads to apply them", () => {
    open();
    fill("Relayer", "https://relayer.example.com/");
    fill("RPC proxy", " https://rpc.example.com ");
    press(SAVE);

    expect(stored()).toEqual({
      relayerUrl: "https://relayer.example.com",
      rpcProxyUrl: "https://rpc.example.com",
    });
    expect(reloadPage).toHaveBeenCalledOnce();
  });

  it("names the field it cannot use, and changes nothing", () => {
    open();
    fill("Relayer", "https://relayer.example.com");
    const feed = fill("Note feed", "fmd.example.com");
    press(SAVE);

    expect(screen.getByText("Must start with https:// or /.")).toBeInTheDocument();
    expect(feed).toHaveAttribute("aria-invalid", "true");
    expect(stored()).toBeNull();
    expect(reloadPage).not.toHaveBeenCalled();

    fill(feed, "https://fmd.example.com");
    expect(feed).not.toHaveAttribute("aria-invalid");
  });

  it("closes without a reload when nothing changed", async () => {
    const onClose = open();
    press(SAVE);

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(reloadPage).not.toHaveBeenCalled();
  });

  it("does not store a URL that only repeats the build's", async () => {
    const onClose = open();
    fill("Registry", "/registry");
    press(SAVE);

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(stored()).toBeNull();
    expect(reloadPage).not.toHaveBeenCalled();
  });

  it("opens on the stored choices, and resets them to the build's", () => {
    localStorage.setItem(KEY, JSON.stringify({ fmdUrl: "https://fmd.example.com" }));
    open();
    expect(screen.getByLabelText("Note feed")).toHaveValue("https://fmd.example.com");

    press("Reset to defaults");
    expect(screen.getByLabelText("Note feed")).toHaveValue("");

    press(SAVE);
    expect(stored()).toBeNull();
    expect(reloadPage).toHaveBeenCalledOnce();
  });

  it("does not reload when the browser refuses to store the change", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    open();
    fill("Relayer", "https://relayer.example.com");
    press(SAVE);

    expect(screen.getByRole("alert")).toHaveTextContent("would not store the change");
    expect(reloadPage).not.toHaveBeenCalled();
  });

  it("holds the save while a transaction needs this tab", () => {
    const scope = opScope(31337n, "lelantos1me");
    open();
    expect(screen.getByRole("button", { name: SAVE })).toBeEnabled();

    act(() => beginOp(opKey(scope, "transfer"), { label: "transfer", path: "/send", scope }));

    expect(screen.getByRole("button", { name: SAVE })).toBeDisabled();
    expect(screen.getByText(/A transaction is in progress/)).toBeInTheDocument();
  });

  it("says where chain reads go when only the registry is replaced", () => {
    open();
    const note = /Chain reads will use the RPC this registry names/;
    expect(screen.queryByText(note)).not.toBeInTheDocument();

    fill("Registry", "https://registry.example.com");
    expect(screen.getByText(note)).toBeInTheDocument();

    fill("RPC proxy", "https://rpc.example.com");
    expect(screen.queryByText(note)).not.toBeInTheDocument();
  });

  it("closes on Cancel, leaving the stored choices alone", async () => {
    localStorage.setItem(KEY, JSON.stringify({ fmdUrl: "https://fmd.example.com" }));
    const onClose = open();
    fill("Note feed", "https://fmd.other.example.com");
    press("Cancel");

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(stored()).toEqual({ fmdUrl: "https://fmd.example.com" });
  });
});
