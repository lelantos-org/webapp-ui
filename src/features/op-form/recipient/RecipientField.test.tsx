// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { RecipientField } from "./RecipientField";

const VALID = `0x${"ab".repeat(20)}`;
const isValid = (v: string) => /^0x[0-9a-f]{40}$/i.test(v);

/// A stand-in for react-hook-form: `register` hands the
/// field `onChange`/`onBlur`/`ref`, and the form watches the value back in.
function Harness({
  onSubmit = vi.fn(),
  onPaste,
}: {
  onSubmit?: () => void;
  onPaste?: (text: string) => void;
}) {
  const [value, setValue] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <RecipientField
        inputProps={{
          name: "to",
          onChange: async (e) => setValue((e.target as HTMLTextAreaElement).value),
          onBlur: async () => undefined,
          ref: () => undefined,
        }}
        label="To"
        placeholder="0x…"
        value={value}
        isValid={isValid}
        invalidMessage="That is not a valid public address"
        onPaste={onPaste ?? setValue}
        helper="A public address."
      />
    </form>
  );
}

describe("RecipientField", () => {
  it("does not call a half-typed address invalid while the user is still in it", () => {
    render(<Harness />);
    const field = screen.getByLabelText("To");
    fireEvent.change(field, { target: { value: "0x12" } });

    expect(field).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByText("That is not a valid public address")).toBeNull();
  });

  it("calls it invalid once the user leaves the field", () => {
    render(<Harness />);
    const field = screen.getByLabelText("To");
    fireEvent.change(field, { target: { value: "0x12" } });
    fireEvent.blur(field);

    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("That is not a valid public address")).toBeInTheDocument();
  });

  it("never calls an empty field invalid", () => {
    render(<Harness />);
    const field = screen.getByLabelText("To");
    fireEvent.blur(field);

    expect(field).not.toHaveAttribute("aria-invalid");
  });

  // The grouping itself is `grouped`'s, pinned in `shared/lib/address.test.ts`.
  it("marks a valid address", () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("To"), { target: { value: VALID } });

    expect(screen.getByRole("img", { name: "valid address" })).toBeInTheDocument();
  });

  it("submits on Enter instead of writing a newline", () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    const field = screen.getByLabelText("To");

    const allowed = fireEvent.keyDown(field, { key: "Enter" });

    expect(allowed).toBe(false);
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it("drops whitespace from a pasted address", () => {
    // The field is uncontrolled, as under react-hook-form; the cleaned text goes
    // through `onPaste`, which writes it with `setValue`.
    const onPaste = vi.fn();
    render(<Harness onPaste={onPaste} />);
    const field = screen.getByLabelText("To");

    const allowed = fireEvent.paste(field, {
      clipboardData: { getData: () => ` ${VALID.slice(0, 20)}\n${VALID.slice(20)} ` },
    });

    expect(allowed).toBe(false);
    expect(onPaste).toHaveBeenCalledWith(VALID);
  });
});
