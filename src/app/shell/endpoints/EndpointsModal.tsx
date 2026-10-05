import { useIsMutating } from "@tanstack/react-query";
import { type FormEvent, useId, useState } from "react";
import {
  applyEndpointOverrides,
  ENDPOINT_FIELDS,
  type EndpointField,
  type EndpointOverrides,
  readEndpointOverrides,
  userEndpointUrl,
} from "@/config/endpoints";
import { builtinEndpoint, customEndpoints } from "@/config/env";
import { useOpNeedsTab } from "@/features/tx";
import { useExitTransition } from "@/shared/hooks/use-exit-transition";
import { cx } from "@/shared/lib/cx";
import { capitalizeFirst } from "@/shared/lib/format/text";
import { MODAL_EXIT_MS } from "@/shared/lib/motion";
import { Modal } from "@/shared/ui/Modal";
import { Notice } from "@/shared/ui/Notice";
import "./EndpointsModal.css";

type Values = Record<EndpointField, string>;
type FieldErrors = Partial<Record<EndpointField, string>>;

const EMPTY: Values = { registryUrl: "", relayerUrl: "", fmdUrl: "", rpcProxyUrl: "" };

const COPY: Record<EndpointField, { label: string; hint: string }> = {
  registryUrl: { label: "Registry", hint: "Names the networks, contracts and assets." },
  relayerUrl: { label: "Relayer", hint: "Quotes fees and submits your transactions." },
  fmdUrl: {
    label: "Note feed",
    hint: "Finds the notes sent to you. A change rebuilds your balance from the new feed.",
  },
  rpcProxyUrl: {
    label: "RPC proxy",
    hint: "Reads chain state, one network per /v1/<chain id>.",
  },
};

/// The URLs the form names that differ from the build's, and what is wrong with the rest.
function check(values: Values): { chosen: EndpointOverrides; errors: FieldErrors } {
  const entered: EndpointOverrides = {};
  const errors: FieldErrors = {};
  for (const field of ENDPOINT_FIELDS) {
    if (values[field].trim() === "") continue;
    const parsed = userEndpointUrl.safeParse(values[field]);
    if (parsed.success) entered[field] = parsed.data;
    else errors[field] = `${capitalizeFirst(parsed.error.issues[0]?.message ?? "is not usable")}.`;
  }
  return { chosen: customEndpoints(entered), errors };
}

/// Lets the user point the registry, relayer, note feed and RPC proxy at services of their own.
/// A change is stored and applied by reloading: the wallet holds its clients for its lifetime.
export function EndpointsModal({ onClose }: { onClose(): void }) {
  const [stored] = useState(readEndpointOverrides);
  const [values, setValues] = useState<Values>(() => ({ ...EMPTY, ...stored }));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [unsaved, setUnsaved] = useState(false);
  const { exiting, exit } = useExitTransition(MODAL_EXIT_MS);
  const needsTab = useOpNeedsTab();
  const mutating = useIsMutating() > 0;
  const transacting = needsTab || mutating;
  const baseId = useId();
  const descId = `${baseId}-desc`;

  const dismiss = () => exit(onClose);

  const set = (field: EndpointField, value: string) => {
    setValues((v) => ({ ...v, [field]: value }));
    setErrors(({ [field]: _cleared, ...rest }) => rest);
  };

  const reset = () => {
    setValues(EMPTY);
    setErrors({});
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const { chosen, errors: found } = check(values);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    if (ENDPOINT_FIELDS.every((field) => chosen[field] === stored[field])) {
      dismiss();
      return;
    }
    if (!applyEndpointOverrides(chosen)) setUnsaved(true);
  };

  // Its read RPC comes from the registry, which may name a path meant for its own origin.
  const registryDecidesRpc = values.registryUrl.trim() !== "" && values.rpcProxyUrl.trim() === "";

  return (
    <Modal title="Network endpoints" onDismiss={dismiss} exiting={exiting} describedBy={descId}>
      <p className="modal-copy" id={descId}>
        Leave a field empty to use this app's own service. A service you name here sees your
        requests, and a registry decides which contracts the app uses, so enter only ones you trust.
      </p>

      <form className="epm" noValidate onSubmit={onSubmit}>
        {ENDPOINT_FIELDS.map((field) => {
          const inputId = `${baseId}-${field}`;
          const hintId = `${inputId}-hint`;
          const errorId = `${inputId}-err`;
          const error = errors[field];
          return (
            <div className="epm__field" key={field}>
              <label className="epm__lbl" htmlFor={inputId}>
                {COPY[field].label}
              </label>
              <input
                id={inputId}
                className="text-input mono"
                type="text"
                inputMode="url"
                placeholder={builtinEndpoint(field) ?? "set by the registry"}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                value={values[field]}
                aria-invalid={error ? true : undefined}
                aria-describedby={cx(hintId, error && errorId)}
                onChange={(e) => set(field, e.target.value)}
              />
              <span className="epm__hint" id={hintId}>
                {COPY[field].hint}
              </span>
              {error ? (
                <span className="epm__err" id={errorId}>
                  {error}
                </span>
              ) : null}
            </div>
          );
        })}

        {registryDecidesRpc ? (
          <Notice tone="neutral" announce={false}>
            Chain reads will use the RPC this registry names. If it names a path instead of a full
            URL, that path is looked up on this app, so set an RPC proxy too.
          </Notice>
        ) : null}
        {transacting ? (
          <Notice tone="warn">
            A transaction is in progress. Endpoints can be changed once it has finished.
          </Notice>
        ) : null}
        {unsaved ? (
          <Notice tone="err" announce="alert">
            This browser would not store the change, so nothing was changed.
          </Notice>
        ) : null}

        <div className="modal-actions epm__actions">
          <button type="button" className="btn btn--ghost epm__reset" onClick={reset}>
            Reset to defaults
          </button>
          <button type="button" className="btn btn--ghost" onClick={dismiss}>
            Cancel
          </button>
          <button type="submit" className="btn" data-primary disabled={transacting}>
            Save and reload
          </button>
        </div>
      </form>
    </Modal>
  );
}
