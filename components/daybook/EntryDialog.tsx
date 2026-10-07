"use client";

import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import { loadFormLists, loadPurchaseForm, loadSaleForm } from "@/app/actions/daybook-forms";
import type { FormLists } from "@/app/actions/daybook-forms";
import { blankRecord, eraseRecord, lacking, offerLabel, offersFor, offerToCorrect, RecordFields, runRecord } from "@/components/daybook/records";
import { PurchaseForm } from "@/components/PurchaseForm";
import { SaleForm } from "@/components/SaleForm";
import { Field, Notice, SelectField } from "@/components/ui";
import { autoAmount, blankValues, parseEntry, PAY_MODES, takesLines, valuesOf } from "@/lib/daybook/entry";
import type { EntryErrors, EntryValues } from "@/lib/daybook/entry";
import { fieldLabel, headName, labelsFor } from "@/lib/daybook/i18n";
import type { Entry, Head, Lang, PayMode } from "@/lib/daybook/types";
import { btn, iconButtonClass } from "@/lib/styles";

// What the popup was opened for: a new entry (under a head, if one was picked) or an existing one.
export type DialogState = { headId?: string; entry?: Entry } | null;
type Result = { error?: string };

type Props = {
  heads: Head[];
  rules: Record<string, string>; // which head each kind of app entry is written under
  day: string;
  today: string;
  lang: Lang;
  parties: string[]; // names used before, offered while typing
  owner: boolean;
  onSave: (values: EntryValues, id?: string) => Promise<Result>;
  onDelete: (id: string) => Promise<Result>;
  onChanged: (id: string) => void; // an entry already on the page was saved again
  onClose: () => void;
};

// The one place entries are typed. The page itself is only ever read.
export function EntryDialog({ state, onClose, ...rest }: Props & { state: DialogState }) {
  const ref = useRef<HTMLDialogElement>(null);
  // A press that began inside the form and ended outside it (selecting text, say) is not a click on the backdrop.
  const pressedOutside = useRef(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (state && !dialog.open) {
      dialog.showModal();
      dialog.querySelector<HTMLElement>("[data-first]")?.focus();
    } else if (!state && dialog.open) {
      dialog.close();
    }
  }, [state]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onMouseDown={(event) => { pressedOutside.current = event.target === event.currentTarget; }}
      onClick={(event) => { if (pressedOutside.current && event.target === event.currentTarget) onClose(); }}
      className="m-auto max-h-[calc(100dvh-1.5rem)] w-[min(36rem,calc(100vw-1.5rem))] overflow-y-auto rounded-2xl border border-line bg-card p-0 text-fg shadow-pop backdrop:bg-black/40 backdrop:backdrop-blur-[2px] has-[[data-wide]]:w-[min(72rem,calc(100vw-1.5rem))] print:hidden"
    >
      {state && <EntryForm state={state} onClose={onClose} {...rest} />}
    </dialog>
  );
}

function EntryForm({ state, heads, rules, day, today, lang, parties, owner, onSave, onDelete, onChanged, onClose }: Props & { state: NonNullable<DialogState> }) {
  const t = labelsFor(lang);
  const editing = state.entry;
  // An expense or a bank transfer opened from the page is corrected in the form it was made in.
  const corrected = editing?.source ? offerToCorrect(editing.source, editing.flow) : undefined;
  const listId = useId();
  const form = useRef<HTMLFormElement>(null);
  const offersOf = (headId: string) => {
    const found = heads.find((h) => h.id === headId);
    return found && !editing ? offersFor(found, rules) : [];
  };

  const [values, setValues] = useState<EntryValues>(() => (editing ? valuesOf(editing) : blankValues(day, state.headId)));
  // Until an amount is typed, it follows weight × rate.
  const [typedAmt, setTypedAmt] = useState(() => {
    const start = editing ? valuesOf(editing) : null;
    return start !== null && start.amt !== autoAmount(start.weight, start.rate);
  });
  // What is being made under the head: one of the app's own records, or ("") a plain line.
  const [offerId, setOfferId] = useState(() => offersOf(state.headId ?? "")[0]?.id ?? "");
  const [record, setRecord] = useState<Record<string, string>>(() => {
    if (corrected) return { ...blankRecord(corrected), ...editing?.source?.values };
    const first = offersOf(state.headId ?? "")[0];
    return first ? blankRecord(first) : {};
  });
  const [lists, setLists] = useState<FormLists | null>(null);
  const [sale, setSale] = useState<{ day: string; data: Awaited<ReturnType<typeof loadSaleForm>> } | null>(null);
  const [purchase, setPurchase] = useState<Awaited<ReturnType<typeof loadPurchaseForm>> | null>(null);
  const [errors, setErrors] = useState<EntryErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [warned, setWarned] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const head = heads.find((h) => h.id === values.headId);
  const offers = corrected ? [corrected] : offersOf(values.headId);
  const offer = corrected ?? offers.find((o) => o.id === offerId);
  const whole = offer?.form === "newSale" || offer?.form === "newPurchase"; // the app's own bill form, shown whole
  const plainAllowed = !corrected && (!head || takesLines(head));
  const past = values.day < today || (editing ? editing.day < today : false);
  // An entry of an earlier day is the owner's alone to change; anyone else may only read it.
  const locked = !owner && editing !== undefined && editing.day < today;
  const dayOk = /^\d{4}-\d{2}-\d{2}$/.test(values.day) && values.day <= today;
  const first = corrected ? "day" : editing ? "amt" : !values.headId ? "head" : offers.length > 0 ? "kind" : "party";

  // The lists a record's form chooses from are fetched when such a form is first shown, and
  // again after each save, since a payment changes what is still due.
  const needsLists = Boolean(offer) && !whole;
  useEffect(() => {
    if (!needsLists || lists) return;
    let live = true;
    void loadFormLists().then((loaded) => { if (live) setLists(loaded); });
    return () => { live = false; };
  }, [needsLists, lists]);

  const formShown = offer?.form;
  const loadedDay = sale?.day;
  useEffect(() => {
    let live = true;
    if (formShown === "newSale" && dayOk && loadedDay !== values.day) {
      void loadSaleForm(values.day).then((data) => { if (live) setSale({ day: values.day, data }); });
    }
    if (formShown === "newPurchase" && !purchase) {
      void loadPurchaseForm().then((data) => { if (live) setPurchase(data); });
    }
    return () => { live = false; };
  }, [formShown, dayOk, values.day, loadedDay, purchase]);

  const set = (patch: Partial<EntryValues>) => setValues((current) => ({ ...current, ...patch }));
  const setMeasure = (patch: Pick<Partial<EntryValues>, "weight" | "rate">) => {
    const next = { ...values, ...patch };
    setValues(head?.showRate && !typedAmt ? { ...next, amt: autoAmount(next.weight, next.rate) } : next);
  };
  const problem = (key: string) => (errors[key] ? <span className="text-bad">{t.errors[errors[key]]}</span> : undefined);

  const chooseOffer = (id: string, among = offers) => {
    const chosen = among.find((o) => o.id === id);
    setOfferId(chosen?.id ?? "");
    setRecord(chosen ? blankRecord(chosen) : {});
    setFailure(null);
    setWarned(false);
  };
  // Another head offers other things; start on the first of them.
  const chooseHead = (headId: string) => {
    set({ headId });
    const next = offersOf(headId);
    chooseOffer(next[0]?.id ?? "", next);
  };

  const submit = async (again: boolean) => {
    if (offer) {
      if (!lists) return;
      if (!dayOk) return setErrors({ day: "day" });
      setErrors({});
      if (lacking(offer, record)) return setFailure(t.rec.needed);
      if (past && !warned) return setWarned(true);

      setPending(true);
      setFailure(null);
      // The app's own actions answer in English; what they say is shown as it comes.
      const result = await runRecord(offer, record, values.day, today, lists, editing?.source ?? undefined).catch(() => ({ error: t.failures.failed }));
      setPending(false);
      if (result?.error) return setFailure(result.error);
      if (editing) onChanged(editing.id);
      if (!again) return onClose();

      setRecord(blankRecord(offer, record));
      setLists(null);
      setWarned(false);
      form.current?.querySelector<HTMLElement>("[data-first]")?.focus();
      return;
    }

    const parsed = parseEntry(values, heads, today);
    if (parsed.errors) return setErrors(parsed.errors);
    setErrors({});
    // An earlier day is saved only on a second press, after the warning has been shown.
    if (past && !warned) return setWarned(true);

    setPending(true);
    setFailure(null);
    const result = await onSave(values, editing?.id);
    setPending(false);
    if (result.error) return setFailure(result.error);
    if (editing) onChanged(editing.id);
    if (!again) return onClose();

    // Ready for the next line under the same head.
    setValues(blankValues(values.day, values.headId, values.mode));
    setTypedAmt(false);
    setWarned(false);
    form.current?.querySelector<HTMLElement>("[data-party]")?.focus();
  };

  const remove = async () => {
    if (!editing) return;
    setPending(true);
    setFailure(null);
    const result = editing.source
      ? await eraseRecord(editing.source).catch(() => ({ error: t.failures.failed }))
      : await onDelete(editing.id);
    setPending(false);
    if (result?.error) return setFailure(result.error);
    onClose();
  };

  // The opening cash is brought forward, never typed; every other head can be written under.
  // A line being changed can move only to a head that takes typed lines.
  const offered = (side: Head["side"]) =>
    heads
      .filter((h) => h.side === side && h.role !== "opening" && (editing ? takesLines(h) || h.id === values.headId : true) && (h.active || h.id === values.headId))
      .sort((a, b) => a.sortOrder - b.sortOrder);

  // The head, the day and what is being made: the same at the top of every form.
  const top = (
    <>
      <div className="flex items-start justify-between gap-4">
        <h2 className="font-serif text-[1.375rem] leading-tight font-medium text-fg">{editing ? t.editEntry : t.newEntry}</h2>
        <button type="button" onClick={onClose} aria-label={t.close} title={t.close} className={`-mt-1 -mr-2 ${iconButtonClass}`}>
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      <div className={`grid grid-cols-1 gap-4 ${whole ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
        <SelectField
          label={`${t.head} *`}
          value={values.headId}
          onChange={(event) => chooseHead(event.target.value)}
          disabled={Boolean(corrected)} // the head follows from what the record is
          data-first={first === "head" ? "" : undefined}
          aria-invalid={Boolean(errors.headId)}
          hint={problem("headId")}
        >
          <option value="">…</option>
          {(["credit", "debit"] as const).map((side) => (
            <optgroup key={side} label={side === "credit" ? t.credit : t.debit}>
              {offered(side).map((h) => <option key={h.id} value={h.id}>{headName(h, lang)}</option>)}
            </optgroup>
          ))}
        </SelectField>
        <Field
          label={`${t.date} *`}
          type="date"
          max={today}
          value={values.day}
          onChange={(event) => set({ day: event.target.value })}
          data-first={first === "day" ? "" : undefined}
          aria-invalid={Boolean(errors.day)}
          hint={problem("day")}
        />
        {offers.length > 0 && (
          <SelectField
            label={t.rec.kind}
            className={whole ? "" : "sm:col-span-2"}
            value={offer?.id ?? ""}
            onChange={(event) => chooseOffer(event.target.value)}
            disabled={Boolean(corrected)}
            data-first={first === "kind" ? "" : undefined}
          >
            {offers.map((o) => <option key={o.id} value={o.id}>{offerLabel(o, t)}</option>)}
            {plainAllowed && <option value="">{t.rec.plain}</option>}
          </SelectField>
        )}
      </div>
    </>
  );

  if (whole) {

    const billDay = values.day === today ? undefined : values.day;
    return (
      <div data-wide="" className="space-y-5 p-5 sm:p-6">
        {top}
        {past && <Notice tone="warn">{t.pastDay}</Notice>}
        {offer?.form === "newSale" && (sale?.day === values.day
          ? <SaleForm key={values.day} {...sale.data} date={billDay} onSaved={onClose} onCancel={onClose} />
          : <p className="text-sm text-fg-3">{t.rec.loading}</p>)}
        {offer?.form === "newPurchase" && (purchase
          ? <PurchaseForm key={`${values.day} ${offer.id}`} {...purchase} date={billDay} metal={offer.metal === "silver" ? "Silver" : offer.metal === "gold" ? "Gold" : undefined} onSaved={onClose} onCancel={onClose} />
          : <p className="text-sm text-fg-3">{t.rec.loading}</p>)}
      </div>
    );
  }

  // The amount sits beside the weight, or on the next row when purity and rate are asked for.
  const amount = (
    <Field
      label={`${t.amount} *`}
      type="number"
      inputMode="decimal"
      step="0.01"
      min="0"
      value={values.amt}
      onChange={(event) => {
        setTypedAmt(event.target.value.trim() !== "");
        set({ amt: event.target.value });
      }}
      data-first={first === "amt" ? "" : undefined}
      aria-invalid={Boolean(errors.amt)}
      hint={problem("amt") ?? (head?.showRate && !typedAmt && values.amt ? t.amountAuto : undefined)}
    />
  );

  return (
    <form
      ref={form}
      noValidate
      onSubmit={(event) => { event.preventDefault(); void submit(false); }}
      onKeyDown={(event) => {
        if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && !editing) {
          event.preventDefault();
          void submit(true);
        }
      }}
      className="space-y-4 p-5 sm:p-6"
    >
      {top}

      {offer ? (
        <RecordFields offer={offer} values={record} onChange={(name, value) => setRecord((current) => ({ ...current, [name]: value }))} lists={lists} t={t} />
      ) : (
        <>
          <Field
            label={head?.partyRequired ? `${t.party} *` : t.party}
            type="text"
            list={listId}
            autoComplete="off"
            value={values.party}
            onChange={(event) => set({ party: event.target.value })}
            data-party=""
            data-first={first === "party" ? "" : undefined}
            aria-invalid={Boolean(errors.party)}
            hint={problem("party")}
          />
          <datalist id={listId}>
            {parties.map((name) => <option key={name} value={name} />)}
          </datalist>

          <div className={`grid grid-cols-1 gap-4 ${head?.showRate ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
            <Field
              label={t.weight}
              type="number"
              inputMode="decimal"
              step="0.001"
              min="0"
              value={values.weight}
              onChange={(event) => setMeasure({ weight: event.target.value })}
              aria-invalid={Boolean(errors.weight)}
              hint={problem("weight")}
            />
            {head?.showRate && (
              <>
                <Field
                  label={t.purity}
                  type="number"
                  inputMode="decimal"
                  step="0.001"
                  min="0"
                  value={values.purity}
                  onChange={(event) => set({ purity: event.target.value })}
                  aria-invalid={Boolean(errors.purity)}
                  hint={problem("purity")}
                />
                <Field
                  label={t.rate}
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={values.rate}
                  onChange={(event) => setMeasure({ rate: event.target.value })}
                  aria-invalid={Boolean(errors.rate)}
                  hint={problem("rate")}
                />
              </>
            )}
            {!head?.showRate && amount}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {head?.showRate && amount}
            <SelectField label={t.mode} value={values.mode} onChange={(event) => set({ mode: event.target.value as PayMode })}>
              {PAY_MODES.map((mode) => <option key={mode} value={mode}>{t.modes[mode]}</option>)}
            </SelectField>
          </div>

          {head && head.extraFields.length > 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {head.extraFields.map((field) => (
                <Field
                  key={field.key}
                  label={field.required ? `${fieldLabel(field, lang)} *` : fieldLabel(field, lang)}
                  type={field.type}
                  inputMode={field.type === "number" ? "decimal" : undefined}
                  step={field.type === "number" ? "any" : undefined}
                  value={values.extra[field.key] ?? ""}
                  onChange={(event) => set({ extra: { ...values.extra, [field.key]: event.target.value } })}
                  aria-invalid={Boolean(errors[`extra.${field.key}`])}
                  hint={problem(`extra.${field.key}`)}
                />
              ))}
            </div>
          )}

          <Field label={t.note} type="text" value={values.note} onChange={(event) => set({ note: event.target.value })} />
        </>
      )}

      {locked && <Notice tone="warn">{t.failures.owner}</Notice>}
      {past && warned && !confirming && <Notice tone="warn">{t.pastDay}</Notice>}
      {failure && <p role="alert" className="text-sm text-bad">{failure}</p>}

      {confirming ? (
        <Notice tone="bad" title={t.confirmDelete}>
          {past && <p>{t.pastDay}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => void remove()} disabled={pending} className={btn("danger")}>{t.yesDelete}</button>
            <button type="button" onClick={() => setConfirming(false)} disabled={pending} className={btn("secondary")}>{t.noKeep}</button>
          </div>
        </Notice>
      ) : (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button type="submit" disabled={pending || locked || (Boolean(offer) && !lists)} className={btn()}>
            {pending ? t.saving : past && warned ? t.saveAnyway : t.save}
          </button>
          {!editing && (
            <button type="button" onClick={() => void submit(true)} disabled={pending || (Boolean(offer) && !lists)} className={btn("secondary")} title="Ctrl + Enter">
              {t.saveAnother}
            </button>
          )}
          <button type="button" onClick={onClose} disabled={pending} className={btn("ghost")}>{t.cancel}</button>
          {editing && (
            <button type="button" onClick={() => setConfirming(true)} disabled={pending || locked} className={`ml-auto ${btn("ghost")} text-bad! hover:bg-bad/8!`}>
              {t.delete}
            </button>
          )}
        </div>
      )}
    </form>
  );
}
