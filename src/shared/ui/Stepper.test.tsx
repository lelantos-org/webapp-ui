import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Stepper, type StepperItem } from "@/shared/ui/Stepper";

const STEPS: StepperItem[] = [
  { id: "submitting", label: "sign transaction" },
  { id: "broadcast", label: "pending deposit" },
  { id: "mined", label: "deposit accepted" },
];

/// The list itself is a picture — marks are `aria-hidden` and state lives in
/// class names — so the live region is the only thing a screen reader can
/// follow a minutes-long transaction by.
const announcement = () => screen.getByRole("status").textContent;

describe("Stepper", () => {
  it("says nothing before a step has started", () => {
    render(<Stepper steps={STEPS} />);

    expect(announcement()).toBe("");
  });

  it("names the step in progress and where it falls", () => {
    render(<Stepper steps={STEPS} current="broadcast" />);

    expect(announcement()).toBe("step 2 of 3: pending deposit");
  });

  it("announces the failure rather than leaving the last progress line up", () => {
    render(<Stepper steps={STEPS} current="broadcast" failed />);

    expect(announcement()).toBe("step 2 of 3 failed: pending deposit");
  });

  it("reports a failure that arrived before any step did", () => {
    // `stateAt` puts a pre-step failure on the first step; the announcement has
    // to agree, or the op reads as idle.
    render(<Stepper steps={STEPS} failed />);

    expect(announcement()).toBe("step 1 of 3 failed: sign transaction");
  });

  it("announces completion on a terminal phase", () => {
    render(<Stepper steps={STEPS} current="mined" done />);

    expect(announcement()).toBe("step 3 of 3 complete: deposit accepted");
  });

  it("stays quiet when a current step is not in the list", () => {
    // A terminal phase whose id was never a step — `flushed` closes a deposit
    // out but is not one of the three rows.
    render(<Stepper steps={STEPS} current="flushed" />);

    expect(announcement()).toBe("");
  });

  it("renders nothing at all for an empty step list", () => {
    const { container } = render(<Stepper steps={[]} current="mined" />);

    expect(container).toBeEmptyDOMElement();
  });
});
