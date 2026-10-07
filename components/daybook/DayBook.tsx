"use client";

import { useEffect, useState } from "react";
import { deleteDaybookEntry, saveDaybookEntry } from "@/app/actions/daybook";
import { Book } from "@/components/daybook/Book";
import { EntryDialog } from "@/components/daybook/EntryDialog";
import type { DialogState } from "@/components/daybook/EntryDialog";
import { Toolbar } from "@/components/daybook/Toolbar";
import { PageHeader } from "@/components/ui";
import type { EntryValues } from "@/lib/daybook/entry";
import { labelsFor } from "@/lib/daybook/i18n";
import type { Digits, Entry, Head, Lang } from "@/lib/daybook/types";

// The day book screen: the toolbar, the book open at one day, and the popup that entries are typed in.
export function DayBook({
  day,
  today,
  heads,
  rules,
  entries,
  opening,
  bank,
  invocation,
  parties,
  owner,
  lang,
  digits,
}: {
  day: string;
  today: string;
  heads: Head[];
  rules: Record<string, string>; // which head each kind of app entry is written under
  entries: Entry[];
  opening: number;
  bank: number; // what the bank account holds at the end of the day
  invocation: string | null;
  parties: string[];
  owner: boolean; // the owner alone may change an entry of an earlier day
  lang: Lang;
  digits: Digits;
}) {
  const t = labelsFor(lang);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [written, setWritten] = useState<ReadonlySet<string>>(new Set());

  // Which way the page turns when the day changes: forward to a later day, back to an earlier one.
  // Nothing on the page turned to is freshly written.
  const [shown, setShown] = useState<{ day: string; turn?: "next" | "prev" }>({ day });
  // The entries on the page when the popup was last opened. One that arrives afterwards was made
  // through it, whichever form it came from, and is shown being written.
  const [seen, setSeen] = useState<{ open: boolean; ids: ReadonlySet<string> | null }>({ open: false, ids: null });
  if (shown.day !== day) {
    setShown({ day, turn: day > shown.day ? "next" : "prev" });
    setWritten(new Set());
    setSeen({ open: Boolean(dialog), ids: null });
  } else if (Boolean(dialog) !== seen.open) {
    setSeen({ open: Boolean(dialog), ids: dialog ? new Set(entries.map((entry) => entry.id)) : seen.ids });
  } else if (seen.ids) {
    const fresh = entries.filter((entry) => !seen.ids!.has(entry.id)).map((entry) => entry.id);
    if (fresh.length > 0) {
      setSeen({ open: seen.open, ids: new Set(entries.map((entry) => entry.id)) });
      setWritten(new Set(fresh));
    }
  }

  // N opens the form for a new entry, unless something is being typed.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const typing = (event.target as HTMLElement).closest("input, select, textarea, dialog, [contenteditable]");
      if (event.key.toLowerCase() === "n" && !typing && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        setDialog((current) => current ?? {});
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Saving sends the page its entries afresh.
  const save = async (values: EntryValues, id?: string) => {
    const result = await saveDaybookEntry(values, id);
    return result.error ? { error: t.failures[result.error] } : {};
  };

  const remove = async (id: string) => {
    const result = await deleteDaybookEntry(id);
    return result.error ? { error: t.failures[result.error] } : {};
  };

  return (
    <div className="daybook-page space-y-6">
      <PageHeader title={t.title}>
        <Toolbar day={day} today={today} lang={lang} digits={digits} onNew={() => setDialog({})} />
      </PageHeader>

      <Book
        day={day}
        heads={heads}
        entries={entries}
        opening={opening}
        bank={bank}
        invocation={invocation}
        lang={lang}
        digits={digits}
        turn={shown.turn}
        written={written}
        onAdd={(head) => setDialog({ headId: head.id })}
        onOpen={(entry) => setDialog({ entry })}
      />

      <EntryDialog
        state={dialog}
        heads={heads}
        rules={rules}
        day={day}
        today={today}
        lang={lang}
        parties={parties}
        owner={owner}
        onSave={save}
        onDelete={remove}
        // A changed line is written again where it stands.
        onChanged={(id) => setWritten(new Set([id]))}
        onClose={() => setDialog(null)}
      />
    </div>
  );
}
