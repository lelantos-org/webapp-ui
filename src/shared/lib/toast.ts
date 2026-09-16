import { toast } from "sonner";
import { reportError } from "@/shared/lib/errors";

export function toastError(prefix: string, error: unknown): void {
  const { kind, message } = reportError(prefix, error);
  if (kind === "rejected") {
    toast.warning(`${prefix} canceled`, { description: message });
    return;
  }
  toast.error(prefix, { description: message });
}

export function toastInfo(message: string): void {
  toast.info(message);
}

export { toast };
