export type Side = "credit" | "debit"; // जमा, नावे
export type Lang = "mr" | "en";
export type Digits = "deva" | "latn";
// How money moved. The popup offers the first four; "online" is what the app's other screens record.
export type PayMode = "cash" | "upi" | "cheque" | "bank" | "online";

// A word the book adds to an entry made elsewhere in the app, written in the reader's language.
export type Tag = "interest" | "principal" | "refund" | "deposit" | "withdrawal" | "adjustment" | "discount" | "advance" | "bc" | "cancelled";

// A field a head asks for beyond the common ones, such as the item pledged under गिरवी.
export type ExtraField = { key: string; labelMr: string; labelEn: string; type: "text" | "number"; required?: boolean };

export type Head = {
  id: string;
  nameMr: string;
  nameEn: string;
  side: Side;
  sortOrder: number;
  page: 1 | 2; // which sheet of the day it is written on
  role: "opening" | "bank" | null;
  active: boolean;
  partyRequired: boolean;
  showRate: boolean; // asks for purity and rate; the amount is weight × rate unless typed over
  extraFields: ExtraField[];
};

// The app record behind an entry, for the two kinds the page corrects and removes itself: an
// expense, and cash put into or taken out of the bank. `values` are its form's fields as saved.
export type Source = { form: "expense" | "transfer"; id: string; values: Record<string, string> };

// One movement of money entered in the book.
export type Entry = {
  id: string;
  day: string;
  headId: string;
  flow: "in" | "out";
  bank: boolean; // it went through the bank account, not the cash drawer
  amt: number;
  party: string | null;
  weight: number | null;
  purity: number | null;
  rate: number | null;
  note: string | null;
  mode: PayMode;
  extra: Record<string, string>;
  tag: Tag | null;
  editable: boolean; // typed in the day book itself, or one of the two kinds above, so it opens in the popup
  source: Source | null;
  href: string | null; // otherwise, the screen where it was made
};

// A checked entry from the popup form, ready to be saved.
export type EntryInput = Pick<Entry, "day" | "headId" | "amt" | "party" | "weight" | "purity" | "rate" | "note" | "extra"> & { mode: Exclude<PayMode, "online"> };

// One written line under a head. A minus amount takes away from its head's total. A contra line is
// the second writing of a bank entry, on the other side under the bank's head.
export type Line = {
  id: string;
  headId: string;
  amt: number;
  contra: boolean;
  entry: Entry;
  fields: ExtraField[];
};
