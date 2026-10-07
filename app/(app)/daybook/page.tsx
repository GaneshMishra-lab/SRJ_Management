import { cookies } from "next/headers";
import { DayBook } from "@/components/daybook/DayBook";
import { getCurrentUser } from "@/lib/dal";
import { getDay, getHeads, getParties, getRules, getSettings } from "@/lib/daybook/data";
import { readDigits, readLang } from "@/lib/daybook/i18n";
import { istDate } from "@/lib/format";
import { kalam } from "./font";
import "./daybook.css";

export default async function DayBookPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await getCurrentUser();

  const today = istDate();
  const requested = (await searchParams).date;
  const day = typeof requested === "string" && /^\d{4}-\d{2}-\d{2}$/.test(requested) && requested <= today ? requested : today;

  const cookieStore = await cookies();
  const lang = readLang(cookieStore.get("daybook_lang")?.value);
  const digits = readDigits(cookieStore.get("daybook_digits")?.value, lang);

  const [book, rules, settings, parties] = await Promise.all([getHeads().then((heads) => getDay(day, heads)), getRules(), getSettings(), getParties()]);

  return (
    <div className={kalam.variable}>
      <DayBook
        day={day}
        today={today}
        heads={book.heads}
        rules={Object.fromEntries(rules)}
        entries={book.entries}
        opening={book.opening}
        bank={book.bank}
        invocation={settings.showInvocation ? settings.invocation : null}
        parties={parties}
        owner={user.role === "owner"}
        lang={lang}
        digits={digits}
      />
    </div>
  );
}
