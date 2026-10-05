import { act, renderHook } from "@testing-library/react";
import { onTestFinished } from "vitest";
import { usePrivacy } from "@/shared/hooks/use-privacy";

/// Turn privacy mode on, in `act`, until the test ends.
export function hideAmounts(): void {
  const { result } = renderHook(() => usePrivacy());
  act(() => result.current.toggle());
  onTestFinished(() => {
    if (result.current.hidden) act(() => result.current.toggle());
  });
}
