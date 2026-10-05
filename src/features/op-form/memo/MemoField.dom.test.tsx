import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoField } from "./MemoField";

const inputProps = {
  name: "memo",
  onChange: async () => {},
  onBlur: async () => {},
  ref: () => {},
};

function show(value: string) {
  return render(
    <MemoField
      inputProps={inputProps}
      label="Memo (optional)"
      value={value}
      helper="Only the recipient can read it."
    />,
  );
}

describe("MemoField", () => {
  it("counts the bytes used, not the characters", () => {
    show("né 租");
    expect(screen.getByText("7 / 128 bytes")).toBeInTheDocument();
    expect(screen.getByLabelText("Memo (optional)")).toBeValid();
  });

  it("marks a memo over the limit and says by how much", () => {
    show("a".repeat(131));
    const field = screen.getByLabelText("Memo (optional)");
    expect(field).toBeInvalid();
    expect(field).toHaveAccessibleDescription(
      "That memo is 3 bytes too long Only the recipient can read it.",
    );
  });

  it("describes the field by its helper when nothing is wrong", () => {
    show("");
    expect(screen.getByLabelText("Memo (optional)")).toHaveAccessibleDescription(
      "Only the recipient can read it.",
    );
  });
});
