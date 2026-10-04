import { useCallback, useEffect, useState } from "react";

/// How long after the setup closes the deposit may still follow on its own. Past it the user
/// presses Shield themselves: a deposit must not fire long after they looked away.
const FOLLOW_WINDOW_MS = 20_000;

export interface ContinueAfterSetupInputs {
  /// What the form holds, as one string. An edit after arming calls the deposit off.
  entered: string;
  setupOpen: boolean;
  /// The form can be submitted: the setup is confirmed and nothing else holds it.
  ready: boolean;
  submit(): void;
}

export interface ContinueAfterSetup {
  /// The user asked for setup and deposit in one press: run `submit` once the setup is done.
  arm(): void;
  /// The setup was called off.
  disarm(): void;
}

/// Carries a deposit across the one-time setup it had to wait for, so the user does not press
/// Shield a second time.
export function useContinueAfterSetup({
  entered,
  setupOpen,
  ready,
  submit,
}: ContinueAfterSetupInputs): ContinueAfterSetup {
  const [armedFor, setArmedFor] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (armedFor === undefined || setupOpen) return;
    // Hold for the allowance read that confirms the setup; give up if the form was edited.
    if (armedFor === entered && !ready) return;
    setArmedFor(undefined);
    if (armedFor === entered) submit();
  }, [armedFor, entered, setupOpen, ready, submit]);

  useEffect(() => {
    if (armedFor === undefined || setupOpen) return;
    const id = setTimeout(() => setArmedFor(undefined), FOLLOW_WINDOW_MS);
    return () => clearTimeout(id);
  }, [armedFor, setupOpen]);

  const arm = useCallback(() => setArmedFor(entered), [entered]);
  const disarm = useCallback(() => setArmedFor(undefined), []);
  return { arm, disarm };
}
