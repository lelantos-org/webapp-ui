import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Field, TextField } from "./Field";

/// `Field` is the single wiring point for every labelled control in the app, so
/// the id contract it hands to its render prop — the label's `htmlFor` target,
/// the error's `aria-describedby` target, and whether the control should mark
/// itself invalid — is what a later refactor breaks silently. Nothing else
/// asserts it.
describe("TextField", () => {
  it("associates the label with the input", () => {
    render(<TextField label="amount" />);

    expect(screen.getByLabelText("amount")).toBe(screen.getByRole("textbox"));
  });

  it("marks and describes the input when there is an error", () => {
    render(<TextField label="amount" error="must be a positive number" />);
    const input = screen.getByRole("textbox");

    expect(input).toHaveAttribute("aria-invalid", "true");
    const described = document.getElementById(input.getAttribute("aria-describedby") ?? "");
    expect(described).toHaveTextContent("must be a positive number");
  });

  it("leaves both attributes off a clean field", () => {
    render(<TextField label="amount" />);
    const input = screen.getByRole("textbox");

    // Absence already means valid; an explicit "false" on every clean field is
    // noise in the accessibility tree.
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(input).not.toHaveAttribute("aria-describedby");
  });

  it("surfaces `required` to assistive tech as well as the DOM", () => {
    render(<TextField label="recipient" required />);

    expect(screen.getByRole("textbox")).toHaveAttribute("aria-required", "true");
  });

  it("keeps the wiring when a trailing control is rendered alongside", () => {
    render(
      <TextField label="amount" error="too much" trailing={<button type="button">max</button>} />,
    );
    const input = screen.getByRole("textbox");

    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("amount")).toBe(input);
    expect(screen.getByRole("button", { name: "max" })).toBeInTheDocument();
  });
});

describe("Field", () => {
  it("hands the render prop ids and the invalid flag", () => {
    const seen: { inputId: string; descId?: string; invalid: boolean }[] = [];

    render(
      <Field label="asset" error="pick one">
        {(ids) => {
          seen.push(ids);
          return <select id={ids.inputId} aria-describedby={ids.descId} />;
        }}
      </Field>,
    );

    expect(seen).toHaveLength(1);
    expect(seen[0].invalid).toBe(true);
    expect(seen[0].descId).toBeTruthy();
    expect(screen.getByLabelText("asset")).toHaveAttribute("id", seen[0].inputId);
  });

  it("reports not-invalid and omits the description id with no error", () => {
    const seen: { descId?: string; invalid: boolean }[] = [];

    render(
      <Field label="asset">
        {(ids) => {
          seen.push(ids);
          return <select id={ids.inputId} />;
        }}
      </Field>,
    );

    expect(seen[0].invalid).toBe(false);
    expect(seen[0].descId).toBeUndefined();
  });
});
