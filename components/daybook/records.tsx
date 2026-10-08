"use client";

import { useId } from "react";
import type { FormLists } from "@/app/actions/daybook-forms";
import { addGoldLoanPayment, createGoldLoan } from "@/app/actions/goldloans";
import { addExpense, deleteExpense, deleteTransfer, editExpense, editTransfer, transferCash } from "@/app/actions/ledger";
import { addLoanEntry } from "@/app/actions/loans";
import { sellLangdi, tradeBullion } from "@/app/actions/metal";
import { addMiscTrade, payMiscTrade } from "@/app/actions/misc";
import { buyOldItem } from "@/app/actions/oldgold";
import { addOrderPayment, createOrder } from "@/app/actions/orders";
import { addBillPayment } from "@/app/actions/purchases";
import { addRepairPayment } from "@/app/actions/repairs";
import { addSalePayment } from "@/app/actions/sales";
import { Field, Notice, SelectField } from "@/components/ui";
import type { Labels } from "@/lib/daybook/i18n";
import { KINDS } from "@/lib/daybook/kinds";
import type { Entry, Head, Source } from "@/lib/daybook/types";
import { EXPENSE_CATEGORIES } from "@/lib/expenses";
import type { FormState } from "@/lib/form";

// The popup's forms for the app's own records. Under a head, the popup offers a form for each
// kind of app entry written there; each form sends the same fields, to the same action, as the
// screen that record normally comes from, so what is saved here is the real thing.

type Word = keyof Labels["rec"];
type Values = Record<string, string>;
type ListName = Exclude<keyof FormLists, "people">;

type FieldSpec =
  | { kind: "text"; name: string; label: Word; required?: boolean }
  | { kind: "number"; name: string; label: Word; step: string; required?: boolean }
  | { kind: "select"; name: string; label: Word; options: { value: string; label?: Word }[] }
  | { kind: "party"; label: Word; of: string[] } // someone the app knows, or a new name
  | { kind: "pick"; name: string; label: Word; from: ListName } // an open bill, loan, order...
  | { kind: "mode" };

type Form = { fields: FieldSpec[]; run: (data: FormData, values: Values) => Promise<FormState> };

const text = (name: string, label: Word, required = false): FieldSpec => ({ kind: "text", name, label, required });
const rupees = (name: string, label: Word, required = true): FieldSpec => ({ kind: "number", name, label, step: "0.01", required });
const grams = (name: string, label: Word, required = true): FieldSpec => ({ kind: "number", name, label, step: "0.001", required });
const percent = (name: string, label: Word, required = true): FieldSpec => ({ kind: "number", name, label, step: "0.001", required });
const party = (label: Word, ...of: string[]): FieldSpec => ({ kind: "party", label, of });
const pick = (name: string, label: Word, from: ListName): FieldSpec => ({ kind: "pick", name, label, from });
const mode: FieldSpec = { kind: "mode" };

const oldMetal = [grams("weight", "weight"), percent("melting", "melting"), rupees("amt", "agreedValue"), rupees("paid", "paidNow", false), mode];
const anyone = party("person", "customer", "supplier", "staff");

const FORMS = {
  expense: {
    fields: [
      { kind: "select", name: "category", label: "category", options: EXPENSE_CATEGORIES.map((value) => ({ value })) },
      text("desc", "description"),
      rupees("amt", "amount"),
      mode,
    ],
    run: (data) => addExpense(undefined, data),
  },
  // Cash put into the bank, or taken out of it; which way is set by the side of the bank's head.
  transfer: { fields: [rupees("amt", "amount")], run: (data) => transferCash(undefined, data) },
  girviGiven: {
    fields: [party("customer", "customer"), text("item", "pledged", true), text("desc", "pledgeNotes"), grams("weight", "totalWeight"), rupees("amt", "loanAmount"), percent("interest", "interest"), mode],
    run: (data) => createGoldLoan(undefined, data),
  },
  girviReceived: {
    fields: [
      pick("loan", "loan", "loans"),
      { kind: "select", name: "type", label: "towards", options: [{ value: "interest", label: "forInterest" }, { value: "principal", label: "forPrincipal" }] },
      rupees("amt", "amount"),
      mode,
    ],
    run: (data, values) => addGoldLoanPayment(values.loan, undefined, data),
  },
  loan: { fields: [anyone, rupees("amt", "amount"), mode], run: (data) => addLoanEntry("loan", undefined, data) },
  borrow: { fields: [anyone, rupees("amt", "amount"), mode], run: (data) => addLoanEntry("lend", undefined, data) },
  oldGold: {
    fields: [party("customer", "customer"), { kind: "select", name: "metal", label: "metal", options: [{ value: "Gold", label: "gold" }, { value: "Phuli", label: "phuli" }] }, ...oldMetal],
    run: (data) => buyOldItem(undefined, data),
  },
  oldSilver: { fields: [party("customer", "customer"), ...oldMetal], run: (data) => buyOldItem(undefined, data) },
  bullion: {
    fields: [
      party("dealer", "supplier"),
      { kind: "select", name: "standard", label: "standard", options: [{ value: "995" }, { value: "999" }] },
      grams("weight", "weight"),
      rupees("rate", "rate"),
      mode,
    ],
    run: (data) => tradeBullion(undefined, data),
  },
  langdi: {
    fields: [party("buyer", "supplier"), grams("weight", "weight"), percent("testedPurity", "testedPurity", false), rupees("amt", "amount"), mode],
    run: (data) => sellLangdi(undefined, data),
  },
  misc: {
    fields: [pick("item", "item", "items"), { kind: "number", name: "qty", label: "quantity", step: "1", required: true }, rupees("unitPrice", "unitPrice"), party("person", "customer", "supplier"), mode],
    run: (data) => addMiscTrade(undefined, data),
  },
  // Bought from a supplier, in full or on credit: what is paid now, and the days of credit on the rest.
  miscPurchase: {
    fields: [
      pick("item", "item", "items"),
      { kind: "number", name: "qty", label: "quantity", step: "1", required: true },
      rupees("unitPrice", "unitPrice"),
      party("dealer", "supplier"),
      rupees("paid", "paidNowOrAll", false),
      { kind: "number", name: "creditDays", label: "creditDays", step: "1" },
      mode,
    ],
    run: (data) => addMiscTrade(undefined, data),
  },
  miscPayment: { fields: [pick("trade", "miscDue", "miscDue"), rupees("amt", "amount"), mode], run: (data, values) => payMiscTrade(values.trade, undefined, data) },
  salePayment: { fields: [pick("sale", "saleBill", "sales"), rupees("amt", "amount"), mode], run: (data, values) => addSalePayment(values.sale, undefined, data) },
  orderAdvance: { fields: [pick("order", "order", "orders"), rupees("amt", "advance"), mode], run: (data, values) => addOrderPayment(values.order, undefined, data) },
  newOrder: {
    fields: [
      party("customer", "customer"),
      text("name", "ordered", true),
      grams("weight", "approxWeight", false),
      percent("melting", "melting", false),
      rupees("amt", "estimate", false),
      rupees("bookedRate", "bookedRate", false),
      rupees("advance", "advance", false),
      mode,
    ],
    run: (data) => createOrder(undefined, data),
  },
  repairPayment: { fields: [pick("repair", "repair", "repairs"), rupees("amt", "amount"), mode], run: (data, values) => addRepairPayment(values.repair, undefined, data) },
  billPayment: { fields: [pick("bill", "supplierBill", "bills"), rupees("amt", "amount"), mode], run: (data, values) => addBillPayment(values.bill, undefined, data) },
} satisfies Record<string, Form>;

// One thing the popup can make under a head. `preset` holds what the choice itself settles
// (buying or selling, which metal); the two bill forms are the app's own, shown whole.
export type Offer = { id: string; form: keyof typeof FORMS | "newSale" | "newPurchase"; label: Word; metal?: "gold" | "silver"; preset?: Values };

const expenseOffer: Offer = { id: "expense", form: "expense", label: "expense" };
const depositOffer: Offer = { id: "deposit", form: "transfer", label: "deposit", preset: { from: "vault" } };
const withdrawalOffer: Offer = { id: "withdrawal", form: "transfer", label: "withdrawal", preset: { from: "account" } };

// The two kinds of app record the page corrects and removes itself, and the actions that do it.
const CORRECTIONS = {
  expense: { save: editExpense, erase: deleteExpense },
  transfer: { save: editTransfer, erase: deleteTransfer },
} satisfies Record<Source["form"], { save: (id: string, prev: FormState, data: FormData) => Promise<FormState>; erase: (id: string) => Promise<FormState> }>;

// The form such a record is corrected in: the one it was made in.
export const offerToCorrect = (source: Source, flow: Entry["flow"]): Offer =>
  source.form === "expense" ? expenseOffer : flow === "out" ? depositOffer : withdrawalOffer;

export const eraseRecord = (source: Source) => CORRECTIONS[source.form].erase(source.id);

function offersOfKind(kind: string): Offer[] {
  const [family, suffix] = kind.split(".");
  const metal = suffix === "silver" ? "silver" : "gold";
  const Metal = metal === "silver" ? "Silver" : "Gold";
  switch (family) {
    case "sale": return [{ id: "newSale", form: "newSale", label: "newSale" }];
    case "sale_due_received": return [{ id: "salePayment", form: "salePayment", label: "salePayment" }];
    case "order": return [
      { id: `newOrder.${metal}`, form: "newOrder", label: "newOrder", metal, preset: { metal: Metal, from: "daybook" } },
      { id: "orderAdvance", form: "orderAdvance", label: "orderAdvance" },
    ];
    case "bullion_sell": return [{ id: `bullionSell.${metal}`, form: "bullion", label: "bullionSell", metal, preset: { type: "sale", metal: Metal } }];
    case "bullion_buy": return [{ id: `bullionBuy.${metal}`, form: "bullion", label: "bullionBuy", metal, preset: { type: "purchase", metal: Metal } }];
    case "langdi": return [{ id: `langdi.${metal}`, form: "langdi", label: "langdi", metal, preset: { metal: Metal } }];
    case "old": return metal === "silver"
      ? [{ id: "oldSilver", form: "oldSilver", label: "oldMetal", metal, preset: { metal: "Silver", from: "daybook" } }]
      : [{ id: "oldGold", form: "oldGold", label: "oldMetal", metal, preset: { from: "daybook" } }];
    // A purchase head is one metal's: the bill made there is of that metal, and so are the bills paid there.
    case "supplier": return [
      { id: `newPurchase.${metal}`, form: "newPurchase", label: "newPurchase", metal },
      { id: `billPayment.${metal}`, form: "billPayment", label: "billPayment", metal },
    ];
    case "repair": return [{ id: "repairPayment", form: "repairPayment", label: "repairPayment" }];
    case "misc_sale": return [{ id: "miscSale", form: "misc", label: "miscSale", preset: { type: "sale" } }];
    case "misc_purchase": return [
      { id: "miscPurchase", form: "miscPurchase", label: "miscPurchase", preset: { type: "purchase" } },
      { id: "miscPayment", form: "miscPayment", label: "miscPayment" },
    ];
    case "girvi_given": return [{ id: "girviGiven", form: "girviGiven", label: "girviGiven" }];
    case "girvi_received": return [{ id: "girviReceived", form: "girviReceived", label: "girviReceived" }];
    case "loan_given": return [{ id: "loanGiven", form: "loan", label: "loanGiven", preset: { type: "given" } }];
    case "loan_repaid": return [{ id: "loanRepaid", form: "loan", label: "loanRepaid", preset: { type: "repayment" } }];
    case "borrow_taken": return [{ id: "borrowTaken", form: "borrow", label: "borrowTaken", preset: { type: "taken" } }];
    case "borrow_repaid": return [{ id: "borrowRepaid", form: "borrow", label: "borrowRepaid", preset: { type: "repayment" } }];
    case "expense": return [expenseOffer];
    // A supplier's refund and a cash adjustment are made on their own screens only.
    default: return [];
  }
}

// What the popup offers under a head: a form for each kind of app entry written there. `rules`
// says which head each kind goes under. The bank's two heads take only cash in and out of the bank.
export function offersFor(head: Head, rules: Record<string, string>): Offer[] {
  if (head.role === "bank") return [head.side === "debit" ? depositOffer : withdrawalOffer];
  if (head.role === "opening") return [];
  const offers = KINDS.filter((kind) => rules[kind.key] === head.id).flatMap((kind) => offersOfKind(kind.key));
  return offers.filter((offer, index) => offers.findIndex((other) => other.id === offer.id) === index);
}

export const offerLabel = (offer: Offer, t: Labels) => (offer.metal ? `${t.rec[offer.label]} (${t.rec[offer.metal]})` : t.rec[offer.label]);

const fieldsOf = (offer: Offer): FieldSpec[] => (offer.form === "newSale" || offer.form === "newPurchase" ? [] : FORMS[offer.form].fields);
const nameOf = (field: FieldSpec) => (field.kind === "party" ? "party" : field.kind === "mode" ? "mode" : field.name);

// A form's fields as it opens: cash, and the first option of each choice.
export function blankRecord(offer: Offer, keep?: Values): Values {
  const values: Values = {};
  for (const field of fieldsOf(offer)) {
    if (field.kind === "mode") values.mode = keep?.mode ?? "cash";
    else if (field.kind === "select") values[field.name] = field.options[0].value;
    else values[nameOf(field)] = "";
  }
  return values;
}

// Whether a starred field has been left empty.
export const lacking = (offer: Offer, values: Values) =>
  fieldsOf(offer).some((field) => {
    const required = field.kind === "party" || field.kind === "pick" || ((field.kind === "text" || field.kind === "number") && field.required);
    return required && !(values[nameOf(field)] ?? "").trim();
  });

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

// Sends the form to the action its own screen uses, or, for a record being corrected, to the
// action that saves over it. A new entry on a day other than today is sent with that day, and a
// correction always with its day; a party is sent as the person the app knows by that name, or
// as a new one.
export async function runRecord(offer: Offer, values: Values, day: string, today: string, lists: FormLists, correcting?: Source): Promise<FormState> {
  if (offer.form === "newSale" || offer.form === "newPurchase") return undefined;
  const form: Form = FORMS[offer.form];
  const data = new FormData();
  for (const [name, value] of Object.entries({ ...values, ...offer.preset })) {
    if (name !== "party" && name !== "contact") data.set(name, value.trim());
  }
  if (day !== today || correcting) data.set("date", day);
  if (correcting) return CORRECTIONS[correcting.form].save(correcting.id, undefined, data);

  const who = form.fields.find((field): field is Extract<FieldSpec, { kind: "party" }> => field.kind === "party");
  if (who) {
    const known = lists.people.filter((person) => sameName(person.name, values.party));
    const person = known.find((p) => who.of.includes(p.type ?? "")) ?? known[0];
    if (person) data.set("entity", person.id);
    else {
      data.set("newName", values.party.trim());
      data.set("newContact", (values.contact ?? "").trim());
    }
  }
  return form.run(data, values);
}

export function RecordFields({
  offer,
  values,
  onChange,
  lists,
  t,
}: {
  offer: Offer;
  values: Values;
  onChange: (name: string, value: string) => void;
  lists: FormLists | null;
  t: Labels;
}) {
  const listId = useId();
  const fields = fieldsOf(offer);
  if (!lists) return <p className="text-sm text-fg-3">{t.rec.loading}</p>;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {fields.map((field) => {
        if (field.kind === "mode") {
          return (
            <SelectField key="mode" label={t.rec.payMode} value={values.mode ?? "cash"} onChange={(event) => onChange("mode", event.target.value)}>
              <option value="cash">{t.rec.cash}</option>
              <option value="online">{t.rec.online}</option>
            </SelectField>
          );
        }
        if (field.kind === "party") {
          const people = lists.people.filter((person) => field.of.includes(person.type ?? ""));
          const typed = (values.party ?? "").trim();
          const isNew = typed !== "" && !lists.people.some((person) => sameName(person.name, typed));
          return (
            <div key="party" className="space-y-4 sm:col-span-2">
              <Field
                label={`${t.rec[field.label]} *`}
                type="text"
                list={listId}
                autoComplete="off"
                value={values.party ?? ""}
                onChange={(event) => onChange("party", event.target.value)}
                data-party=""
                hint={isNew ? t.rec.newName : undefined}
              />
              <datalist id={listId}>
                {people.map((person) => <option key={person.id} value={person.name} />)}
              </datalist>
              {isNew && <Field label={t.rec.contact} type="tel" value={values.contact ?? ""} onChange={(event) => onChange("contact", event.target.value)} />}
            </div>
          );
        }
        if (field.kind === "pick") {
          // Under a head kept for one metal, only that metal's bills are offered.
          const choices = lists[field.from].filter((choice) => !offer.metal || !choice.metal || choice.metal === offer.metal);
          if (choices.length === 0) return <div key={field.name} className="sm:col-span-2"><Notice tone="warn">{t.rec[field.label]}: {t.rec.nothing}</Notice></div>;
          return (
            <SelectField key={field.name} label={`${t.rec[field.label]} *`} className="sm:col-span-2" value={values[field.name] ?? ""} onChange={(event) => onChange(field.name, event.target.value)}>
              <option value="">{t.rec.choose}</option>
              {choices.map((choice) => <option key={choice.id} value={choice.id}>{choice.label}</option>)}
            </SelectField>
          );
        }
        if (field.kind === "select") {
          return (
            <SelectField key={field.name} label={t.rec[field.label]} value={values[field.name] ?? ""} onChange={(event) => onChange(field.name, event.target.value)}>
              {field.options.map((option) => <option key={option.value} value={option.value}>{option.label ? t.rec[option.label] : option.value}</option>)}
            </SelectField>
          );
        }
        return (
          <Field
            key={field.name}
            label={field.required ? `${t.rec[field.label]} *` : t.rec[field.label]}
            type={field.kind}
            inputMode={field.kind === "number" ? "decimal" : undefined}
            step={field.kind === "number" ? field.step : undefined}
            min={field.kind === "number" ? "0" : undefined}
            value={values[field.name] ?? ""}
            onChange={(event) => onChange(field.name, event.target.value)}
          />
        );
      })}
    </div>
  );
}
