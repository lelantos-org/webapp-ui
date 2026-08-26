import { classifyError, type ErrorKind, friendlyMessage } from "@/shared/lib/errors";
import { createLogger } from "@/shared/lib/logger";

const log = createLogger("error");

export interface ReportedError {
  kind: ErrorKind;
  /// One line safe to render to the user.
  message: string;
}

/// Turn a thrown value into something showable while keeping the cause.
///
/// `friendlyMessage` classifies by keyword and falls back to a generic line, so
/// on its own it can discard the only record of the fault — a viem revert reduces
/// to "Something went wrong". Pairing the two here means a caller cannot show the
/// summary without preserving the detail.
///
/// A user cancellation is not logged: declining a wallet prompt is not a fault.
export function reportError(scope: string, error: unknown): ReportedError {
  const { kind } = classifyError(error);
  if (kind === "rejected") return { kind, message: "Canceled in wallet." };
  log.error(scope, error);
  return { kind, message: friendlyMessage(error) };
}
