"use client";

import { useOptimistic, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus, Printer, Settings } from "lucide-react";
import { Segmented } from "@/components/controls";
import { labelsFor, shiftDay } from "@/lib/daybook/i18n";
import type { Digits, Lang } from "@/lib/daybook/types";
import { btn, iconButtonClass, inputClass } from "@/lib/styles";

const remember = (name: string, value: string) => {
  document.cookie = `${name}=${value}; path=/; max-age=31536000; samesite=lax`;
};

// Moving between days, the language and digit switches, printing, and the way into the entry form.
// One page per day; days after today are not open yet.
export function Toolbar({
  day,
  today,
  lang,
  digits,
  onNew,
}: {
  day: string;
  today: string;
  lang: Lang;
  digits: Digits;
  onNew: () => void;
}) {
  const router = useRouter();
  const t = labelsFor(lang);
  const hrefFor = (target: string) => (target === today ? "/daybook" : `/daybook?date=${target}`);

  // Each choice is kept in a cookie, which the page reads on the server; the switch itself moves at once.
  const [, startTransition] = useTransition();
  const [shownLang, showLang] = useOptimistic(lang);
  const [shownDigits, showDigits] = useOptimistic(digits);
  const chooseLang = (next: Lang) => startTransition(() => {
    showLang(next);
    remember("daybook_lang", next);
    router.refresh();
  });
  const chooseDigits = (next: Digits) => startTransition(() => {
    showDigits(next);
    remember("daybook_digits", next);
    router.refresh();
  });

  return (
    <>
      <div className="flex items-center gap-1">
        <Link href={hrefFor(shiftDay(day, -1))} aria-label={t.previousDay} title={t.previousDay} className={iconButtonClass}>
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </Link>
        <input
          key={day}
          type="date"
          defaultValue={day}
          max={today}
          aria-label={t.chooseDay}
          onChange={(event) => {
            const chosen = event.target.value;
            if (/^\d{4}-\d{2}-\d{2}$/.test(chosen) && chosen <= today) router.push(hrefFor(chosen));
          }}
          className={`${inputClass} w-44`}
        />
        {day < today ? (
          <Link href={hrefFor(shiftDay(day, 1))} aria-label={t.nextDay} title={t.nextDay} className={iconButtonClass}>
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </Link>
        ) : (
          <span className={`${iconButtonClass} pointer-events-none opacity-35`} aria-hidden="true">
            <ChevronRight className="h-5 w-5" />
          </span>
        )}
      </div>
      {day !== today && <Link href="/daybook" className={btn("secondary")}>{t.today}</Link>}

      <Segmented
        label={t.language}
        value={shownLang}
        onChange={chooseLang}
        options={[{ value: "mr", label: "मराठी" }, { value: "en", label: "English" }]}
      />
      <Segmented
        label={t.digits}
        value={shownDigits}
        onChange={chooseDigits}
        options={[{ value: "deva", label: "१२३" }, { value: "latn", label: "123" }]}
      />

      <div className="flex items-center">
        <button type="button" onClick={() => window.print()} aria-label={t.print} title={t.print} className={iconButtonClass}>
          <Printer className="h-4.5 w-4.5" aria-hidden="true" />
        </button>
        <Link href="/daybook/settings" aria-label={t.settings} title={t.settings} className={iconButtonClass}>
          <Settings className="h-4.5 w-4.5" aria-hidden="true" />
        </Link>
      </div>
      <button type="button" onClick={onNew} className={btn()} title="N">
        <Plus className="h-4 w-4" aria-hidden="true" /> {t.newEntry}
      </button>
    </>
  );
}
