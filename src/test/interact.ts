import { act, fireEvent, screen } from "@testing-library/react";

type Name = string | RegExp;

/// Set the value of the field labelled `field` (or the element given) in one change event.
export function fill(field: Name | HTMLElement, value: string): HTMLElement {
  const el = field instanceof HTMLElement ? field : screen.getByLabelText(field);
  fireEvent.change(el, { target: { value } });
  return el;
}

/// Click the button named `button` (or the element given).
export function press(button: Name | HTMLElement): HTMLElement {
  const el = button instanceof HTMLElement ? button : screen.getByRole("button", { name: button });
  fireEvent.click(el);
  return el;
}

/// `press`, then flush the async work the click started.
export async function pressAndSettle(button: Name | HTMLElement): Promise<void> {
  await act(async () => {
    press(button);
  });
}
