import { cookies } from "next/headers";
import { ChevronDown, ChevronUp } from "lucide-react";
import { addHead, moveHead, saveHead, saveInvocation, saveRules } from "@/app/actions/daybook-settings";
import { ActionForm } from "@/components/ActionForm";
import { Card, Field, Notice, PageHeader, SelectField, StatusBadge } from "@/components/ui";
import { getCurrentUser } from "@/lib/dal";
import { getHeads, getRules, getSettings } from "@/lib/daybook/data";
import { headName, labelsFor, readLang } from "@/lib/daybook/i18n";
import type { Labels } from "@/lib/daybook/i18n";
import { KINDS } from "@/lib/daybook/kinds";
import type { Head, Side } from "@/lib/daybook/types";
import { hintClass, iconButtonClass, inputClass, labelClass, selectClass } from "@/lib/styles";

const sides: Side[] = ["credit", "debit"];
type Option = { value: string; label: string };

const Check = ({ name, label, defaultChecked }: { name: string; label: string; defaultChecked?: boolean }) => (
  <label className="flex items-center gap-2 text-sm text-fg-2">
    <input type="checkbox" name={name} defaultChecked={defaultChecked} className="h-4 w-4 accent-accent" />
    {label}
  </label>
);

export default async function DayBookSettingsPage() {
  await getCurrentUser();

  const lang = readLang((await cookies()).get("daybook_lang")?.value);
  const labels = labelsFor(lang);
  const t = labels.set;
  const sideName = (side: Side) => (side === "credit" ? labels.credit : labels.debit);
  const [heads, rules, settings] = await Promise.all([getHeads(), getRules(), getSettings()]);

  const sideOptions = sides.map((side) => ({ value: side, label: sideName(side) }));
  const sheetOptions = [{ value: "1", label: `${labels.sheet} 1` }, { value: "2", label: `${labels.sheet} 2` }];
  // App entries can be written under any head but the bank's, which the book keeps for bank money.
  const placeable = (side: Side) => heads.filter((head) => head.side === side && head.role !== "bank");

  return (
    <div className="space-y-6" lang={lang}>
      <PageHeader title={t.title} subtitle={t.headsHint} back={{ href: "/daybook", label: t.back }} />

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
        {sides.map((side) => {
          const column = heads.filter((head) => head.side === side);
          return (
            <Card key={side} title={`${t.heads}: ${sideName(side)}`} flush>
              <ul>
                {column.map((head, index) => (
                  <li key={head.id} className="flex items-start gap-1 border-t border-line px-3">
                    <div className="flex shrink-0 pt-1.5">
                      <form action={moveHead.bind(null, head.id, -1)}>
                        <button type="submit" disabled={index === 0} aria-label={t.moveUp} title={t.moveUp} className={`${iconButtonClass} disabled:opacity-30`}>
                          <ChevronUp className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </form>
                      <form action={moveHead.bind(null, head.id, 1)}>
                        <button type="submit" disabled={index === column.length - 1} aria-label={t.moveDown} title={t.moveDown} className={`${iconButtonClass} disabled:opacity-30`}>
                          <ChevronDown className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </form>
                    </div>
                    <details className="min-w-0 flex-1">
                      <summary className="flex min-h-12 cursor-pointer flex-wrap items-center gap-x-2 gap-y-1 py-2 pr-2 text-sm">
                        <span className="font-medium text-fg">{head.nameMr}</span>
                        <span className="text-fg-3">{head.nameEn}</span>
                        <span className="ml-auto flex items-center gap-2">
                          {!head.active && <StatusBadge tone="warn">{t.hidden}</StatusBadge>}
                          <span className="text-[13px] text-fg-3">{labels.sheet} {head.page}</span>
                        </span>
                      </summary>
                      <div className="pt-1 pr-2 pb-5">
                        <HeadForm head={head} t={t} sideOptions={sideOptions} sheetOptions={sheetOptions} />
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
      </div>

      <Card title={t.addHead}>
        <ActionForm action={addHead} submitLabel={t.add}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label={t.nameMr} name="nameMr" type="text" required />
            <Field label={t.nameEn} name="nameEn" type="text" required />
            <SelectField label={t.side} name="side" options={sideOptions} />
            <SelectField label={t.sheet} name="page" options={sheetOptions} />
          </div>
        </ActionForm>
      </Card>

      <Card title={t.mapping} hint={t.mappingHint}>
        <ActionForm action={saveRules} submitLabel={t.save}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {KINDS.map((kind) => (
              <SelectField key={kind.key} label={lang === "en" ? kind.labelEn : kind.labelMr} name={`rule.${kind.key}`} defaultValue={rules.get(kind.key) ?? ""}>
                {!rules.has(kind.key) && <option value="">…</option>}
                {sides.map((side) => (
                  <optgroup key={side} label={sideName(side)}>
                    {placeable(side).map((head) => (
                      <option key={head.id} value={head.id}>{headName(head, lang)}{head.active ? "" : ` (${t.hidden})`}</option>
                    ))}
                  </optgroup>
                ))}
              </SelectField>
            ))}
          </div>
        </ActionForm>
      </Card>

      <Card title={t.invocation} hint={t.invocationHint}>
        <ActionForm action={saveInvocation} submitLabel={t.save}>
          <textarea
            name="invocation"
            rows={3}
            defaultValue={settings.invocation}
            aria-label={t.invocation}
            lang="mr"
            className={`${inputClass} h-auto py-2 leading-relaxed`}
          />
          <Check name="show" label={t.showInvocation} defaultChecked={settings.showInvocation} />
        </ActionForm>
      </Card>
    </div>
  );
}

// One head's own form. The opening cash and the bank account are filled in by the book, so only
// their names and page can be changed.
function HeadForm({ head, t, sideOptions, sheetOptions }: { head: Head; t: Labels["set"]; sideOptions: Option[]; sheetOptions: Option[] }) {
  const fixed = head.role !== null;
  // The fields the head already asks for, and an empty row for one more.
  const rows = [...head.extraFields, null];
  return (
    <ActionForm action={saveHead.bind(null, head.id)} submitLabel={t.save}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t.nameMr} name="nameMr" type="text" defaultValue={head.nameMr} required />
        <Field label={t.nameEn} name="nameEn" type="text" defaultValue={head.nameEn} required />
        {!fixed && <SelectField label={t.side} name="side" defaultValue={head.side} options={sideOptions} />}
        <SelectField label={t.sheet} name="page" defaultValue={String(head.page)} options={sheetOptions} />
      </div>
      {fixed ? <Notice>{t.fixed}</Notice> : (
        <>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <Check name="active" label={t.shown} defaultChecked={head.active} />
            <Check name="partyRequired" label={t.partyRequired} defaultChecked={head.partyRequired} />
            <Check name="showRate" label={t.showRate} defaultChecked={head.showRate} />
          </div>
          <fieldset className="space-y-2">
            <legend className={labelClass}>{t.extraFields}</legend>
            {rows.map((field, i) => (
              <div key={field?.key ?? "new"} className="grid grid-cols-2 items-center gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_7rem_auto]">
                <input type="hidden" name={`fieldKey${i}`} value={field?.key ?? ""} />
                <input name={`fieldMr${i}`} type="text" defaultValue={field?.labelMr} placeholder={t.fieldMr} aria-label={t.fieldMr} className={inputClass} />
                <input name={`fieldEn${i}`} type="text" defaultValue={field?.labelEn} placeholder={t.fieldEn} aria-label={t.fieldEn} className={inputClass} />
                <select name={`fieldType${i}`} defaultValue={field?.type ?? "text"} aria-label={t.fieldType} className={selectClass}>
                  <option value="text">{t.text}</option>
                  <option value="number">{t.number}</option>
                </select>
                <Check name={`fieldReq${i}`} label={t.required} defaultChecked={field?.required} />
              </div>
            ))}
            <p className={hintClass}>{t.fieldsHint}</p>
          </fieldset>
        </>
      )}
    </ActionForm>
  );
}
