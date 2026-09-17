import { zodResolver } from "@hookform/resolvers/zod";
import { useId, useMemo } from "react";
import { type FieldErrors, useFieldArray, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import {
  type BuiltAction,
  buildAction,
  composeDescription,
  findFunction,
  functionSignature,
  type KnownContract,
  PROPOSAL_TITLE_MAX,
} from "@/features/governance";
import { cx } from "@/shared/lib/cx";

const draftSchema = z.object({
  target: z.string(),
  value: z.string(),
  mode: z.enum(["function", "raw"]),
  contract: z.string(),
  fn: z.string(),
  args: z.array(z.string()),
  calldata: z.string(),
});

function formSchema(contracts: readonly KnownContract[]) {
  return z
    .object({
      title: z
        .string()
        .trim()
        .min(1, "Give the proposal a title")
        .max(PROPOSAL_TITLE_MAX, `At most ${PROPOSAL_TITLE_MAX} characters`),
      description: z.string(),
      actions: z.array(draftSchema).min(1, "Add at least one action"),
    })
    .superRefine((v, ctx) => {
      v.actions.forEach((a, i) => {
        const r = buildAction(a, contracts);
        if (r.ok) return;
        for (const [key, message] of Object.entries(r.errors)) {
          const path = key.split(".").map((p) => (/^\d+$/.test(p) ? Number(p) : p));
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: message ?? "Invalid",
            path: ["actions", i, ...path],
          });
        }
      });
    });
}

type DraftValues = z.infer<typeof draftSchema>;

interface FormValues {
  title: string;
  description: string;
  actions: DraftValues[];
}

function emptyAction(contracts: readonly KnownContract[]): DraftValues {
  const first = contracts[0];
  return {
    target: first?.address ?? "",
    value: "",
    mode: "function",
    contract: first?.id ?? "",
    fn: "",
    args: [],
    calldata: "",
  };
}

export interface CreateProposalFormProps {
  contracts: readonly KnownContract[];
  /// Set when the account may not propose; the form stays editable, the submit
  /// does not.
  blocked?: string | undefined;
  submitting?: boolean;
  onSubmit(actions: BuiltAction[], description: string): void;
}

/// Title, description and actions; the encoded preview; the submit.
export function CreateProposalForm({
  contracts,
  blocked,
  submitting = false,
  onSubmit,
}: CreateProposalFormProps) {
  const schema = useMemo(() => formSchema(contracts), [contracts]);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { title: "", description: "", actions: [emptyAction(contracts)] },
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "actions" });
  const actions = useWatch({ control: form.control, name: "actions" });
  const errors = form.formState.errors;
  const titleId = useId();
  const descId = useId();

  const submit = form.handleSubmit((v) => {
    const built = v.actions.map((a) => buildAction(a, contracts));
    const ok = built.flatMap((b) => (b.ok ? [b.action] : []));
    if (ok.length !== built.length) return;
    onSubmit(ok, composeDescription(v.title, v.description));
  });

  return (
    <form className="gov-form" noValidate onSubmit={submit}>
      <section className="surface surface--card gov-card">
        <h2 className="gov-card__t">What you propose</h2>
        <label className="gov-field" htmlFor={titleId}>
          <span className="gov-field__lbl">Title</span>
          <input
            id={titleId}
            className="gov-input"
            maxLength={PROPOSAL_TITLE_MAX}
            aria-invalid={errors.title ? true : undefined}
            {...form.register("title")}
          />
        </label>
        <FieldError message={errors.title?.message} />
        <label className="gov-field" htmlFor={descId}>
          <span className="gov-field__lbl">Description</span>
          <textarea
            id={descId}
            className="gov-input gov-input--area"
            rows={8}
            {...form.register("description")}
          />
        </label>
        <p className="gov-note muted">
          Stored on-chain as <span className="mono"># title</span>, a blank line, then this text.
          Readers see it as plain text.
        </p>
      </section>

      {fields.map((field, i) => (
        <ActionRow
          key={field.id}
          index={i}
          form={form}
          contracts={contracts}
          draft={actions?.[i]}
          errors={errors.actions?.[i]}
          onRemove={fields.length > 1 ? () => remove(i) : undefined}
        />
      ))}
      <FieldError message={errors.actions?.root?.message ?? errors.actions?.message} />
      <button
        type="button"
        className="btn btn--outline"
        onClick={() => append(emptyAction(contracts))}
      >
        Add another action
      </button>

      <section className="surface surface--card gov-card" aria-label="Encoded actions">
        <h2 className="gov-card__t">What the governor will receive</h2>
        <ol className="gov-preview">
          {(actions ?? []).map((a, i) => {
            const r = buildAction(a, contracts);
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: preview rows mirror the positional actions above.
              <li key={i} className="gov-preview__row">
                {r.ok ? (
                  <dl className="gov-kv">
                    <div>
                      <dt>Target</dt>
                      <dd className="mono brk">{r.action.target}</dd>
                    </div>
                    <div>
                      <dt>Value (wei)</dt>
                      <dd className="mono">{r.action.value.toString()}</dd>
                    </div>
                    <div>
                      <dt>Calldata</dt>
                      <dd className="mono brk gov-calldata">{r.action.calldata}</dd>
                    </div>
                  </dl>
                ) : (
                  <span className="muted">Action {i + 1} is incomplete.</span>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      <div className="gov-form__cta">
        <button type="submit" className="btn btn--cta" disabled={!!blocked || submitting}>
          {submitting ? "Submitting…" : "Submit proposal"}
        </button>
        {blocked ? <p className="gov-form__why">{blocked}</p> : null}
      </div>
    </form>
  );
}

function FieldError({ message }: { message: string | undefined }) {
  return message ? (
    <span className="gov-field__err" role="alert">
      {message}
    </span>
  ) : null;
}

interface ActionRowProps {
  index: number;
  form: ReturnType<typeof useForm<FormValues>>;
  contracts: readonly KnownContract[];
  draft: DraftValues | undefined;
  errors: FieldErrors<DraftValues> | undefined;
  onRemove: (() => void) | undefined;
}

function ActionRow({ index: i, form, contracts, draft, errors, onRemove }: ActionRowProps) {
  const ids = useId();
  const mode = draft?.mode ?? "function";
  const contract = contracts.find((c) => c.id === draft?.contract);
  const fn = draft ? findFunction(contracts, draft.contract, draft.fn) : undefined;
  const base = `actions.${i}` as const;

  return (
    <section className="surface surface--card gov-card" aria-label={`Action ${i + 1}`}>
      <div className="gov-card__hdr">
        <h2 className="gov-card__t">Action {i + 1}</h2>
        {onRemove ? (
          <button type="button" className="link-btn" onClick={onRemove}>
            Remove
          </button>
        ) : null}
      </div>

      <fieldset className="gov-mode">
        <legend className="sr-only">How to describe the call</legend>
        {(
          [
            ["function", "Pick a function"],
            ["raw", "Raw calldata"],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            type="button"
            className={cx("gov-filter__btn", mode === m && "gov-filter__btn--on")}
            aria-pressed={mode === m}
            onClick={() => form.setValue(`${base}.mode`, m)}
          >
            {label}
          </button>
        ))}
      </fieldset>

      {mode === "function" ? (
        <>
          <label className="gov-field" htmlFor={`${ids}-contract`}>
            <span className="gov-field__lbl">Contract</span>
            <select
              id={`${ids}-contract`}
              className="gov-input"
              {...form.register(`${base}.contract`, {
                onChange: (e: { target: { value: string } }) => {
                  const next = contracts.find((c) => c.id === e.target.value);
                  const prev = contract?.address;
                  const target = form.getValues(`${base}.target`);
                  if (next?.address && (target === "" || target === prev)) {
                    form.setValue(`${base}.target`, next.address);
                  }
                  form.setValue(`${base}.fn`, "");
                  form.setValue(`${base}.args`, []);
                },
              })}
            >
              {contracts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="gov-field" htmlFor={`${ids}-fn`}>
            <span className="gov-field__lbl">Function</span>
            <select
              id={`${ids}-fn`}
              className="gov-input mono"
              aria-invalid={errors?.fn ? true : undefined}
              {...form.register(`${base}.fn`, {
                onChange: () => form.setValue(`${base}.args`, []),
              })}
            >
              <option value="">Choose…</option>
              {(contract?.functions ?? []).map((f) => {
                const sig = functionSignature(f);
                return (
                  <option key={sig} value={sig}>
                    {sig}
                  </option>
                );
              })}
            </select>
          </label>
          <FieldError message={errors?.fn?.message} />
        </>
      ) : null}

      <label className="gov-field" htmlFor={`${ids}-target`}>
        <span className="gov-field__lbl">Target contract</span>
        <input
          id={`${ids}-target`}
          className="gov-input mono"
          placeholder="0x…"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={errors?.target ? true : undefined}
          {...form.register(`${base}.target`)}
        />
      </label>
      <FieldError message={errors?.target?.message} />

      <label className="gov-field" htmlFor={`${ids}-value`}>
        <span className="gov-field__lbl">ETH sent with the call</span>
        <input
          id={`${ids}-value`}
          className="gov-input mono"
          inputMode="decimal"
          placeholder="0"
          aria-invalid={errors?.value ? true : undefined}
          {...form.register(`${base}.value`)}
        />
      </label>
      <FieldError message={errors?.value?.message} />

      {mode === "function" && fn
        ? fn.inputs.map((p, j) => (
            <div key={`${draft?.fn}-${p.name ?? j}`}>
              <label className="gov-field" htmlFor={`${ids}-arg-${j}`}>
                <span className="gov-field__lbl">
                  {p.name || `arg ${j + 1}`} <span className="mono muted">{p.type}</span>
                </span>
                <input
                  id={`${ids}-arg-${j}`}
                  className="gov-input mono"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={p.type.endsWith("]") ? "comma-separated" : undefined}
                  aria-invalid={errors?.args?.[j] ? true : undefined}
                  {...form.register(`${base}.args.${j}`)}
                />
              </label>
              <FieldError message={errors?.args?.[j]?.message} />
            </div>
          ))
        : null}

      {mode === "raw" ? (
        <>
          <label className="gov-field" htmlFor={`${ids}-calldata`}>
            <span className="gov-field__lbl">Calldata</span>
            <textarea
              id={`${ids}-calldata`}
              className="gov-input gov-input--area mono"
              rows={3}
              placeholder="0x"
              spellCheck={false}
              aria-invalid={errors?.calldata ? true : undefined}
              {...form.register(`${base}.calldata`)}
            />
          </label>
          <FieldError message={errors?.calldata?.message} />
        </>
      ) : null}
    </section>
  );
}
