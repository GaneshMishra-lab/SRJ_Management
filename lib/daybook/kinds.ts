import type { Side } from "./types";

// The kinds of entry the rest of the app makes in the cash ledger. Each kind is written under one
// head of the day book; which one is kept in daybook_rule and can be changed in the settings.
// `head` is where a kind goes until the owner says otherwise (the head's English name and side).
// Money moving against a head's side (a refund under a sales head, say) is written as a minus line.

export type Kind = { key: string; labelMr: string; labelEn: string; head: { side: Side; nameEn: string } };

const credit = (nameEn: string) => ({ side: "credit" as const, nameEn });
const debit = (nameEn: string) => ({ side: "debit" as const, nameEn });

// A kind that is kept apart for gold and for silver.
const byMetal = (key: string, labelMr: string, labelEn: string, head: (metal: "Gold" | "Silver") => Kind["head"]): Kind[] => [
  { key: `${key}.gold`, labelMr: `${labelMr} (सोने)`, labelEn: `${labelEn} (gold)`, head: head("Gold") },
  { key: `${key}.silver`, labelMr: `${labelMr} (चांदी)`, labelEn: `${labelEn} (silver)`, head: head("Silver") },
];

export const KINDS: Kind[] = [
  ...byMetal("sale", "विक्री बिलाचे पैसे", "Sale bill payment", (metal) => credit(`${metal} Sales`)),
  ...byMetal("order", "ऑर्डरचा आगाऊ", "Order advance", (metal) => credit(`${metal} Sales`)),
  ...byMetal("bullion_sell", "चोख विक्री", "Bullion sold", (metal) => credit(`${metal} Sales`)),
  { key: "repair", labelMr: "दुरुस्तीचे पैसे", labelEn: "Repair charge", head: credit("Panchurani Pethe") },
  { key: "misc_sale", labelMr: "इतर वस्तू विक्री", labelEn: "Misc item sold", head: credit("Panchurani Pethe") },
  { key: "girvi_received", labelMr: "गिरवी व्याज / मुद्दल जमा", labelEn: "Gold loan interest / principal received", head: credit("Girvi (Pledge)") },
  { key: "loan_repaid", labelMr: "उधारी परत आली", labelEn: "Loan repayment received", head: credit("Udhari (Credit)") },
  { key: "borrow_taken", labelMr: "दुकानाने घेतलेले कर्ज", labelEn: "Money the shop borrowed", head: credit("Savkari (Moneylending)") },
  { key: "borrow_repaid", labelMr: "दुकानाने कर्ज फेडले", labelEn: "Borrowing repaid by the shop", head: credit("Savkari (Moneylending)") },
  // Old metal that was bought, melted and sold on: the selling side of the old-metal head.
  ...byMetal("langdi", "लंगडी विक्री", "Langdi sold", () => credit("Bhangare Pethe")),
  { key: "adjustment", labelMr: "रोकड दुरुस्ती", labelEn: "Cash adjustment", head: credit("Opening Cash") },

  // Buying from a supplier, and paying the bill, is written under the metal's purchase head.
  ...byMetal("supplier", "व्यापाऱ्याच्या बिलाचे पैसे", "Supplier bill payment", (metal) => debit(`${metal} Purchase`)),
  ...byMetal("supplier_return", "परत केलेल्या मालाचे पैसे", "Supplier's refund for a returned piece", (metal) => debit(`${metal} Purchase`)),
  ...byMetal("bullion_buy", "चोख खरेदी", "Bullion bought", (metal) => debit(`${metal} Purchase`)),
  ...byMetal("old", "जुने सोने / चांदी खरेदी", "Old metal bought", () => debit("Bhangare Pethe")),
  { key: "misc_purchase", labelMr: "इतर वस्तू खरेदी", labelEn: "Misc item bought", head: debit("Traders / Suppliers") },
  { key: "expense", labelMr: "खर्च", labelEn: "Expense", head: debit("Expenses") },
  { key: "girvi_given", labelMr: "गिरवी दिली", labelEn: "Gold loan given", head: debit("Girvi (Pledge)") },
  { key: "loan_given", labelMr: "उधारी दिली", labelEn: "Loan given", head: debit("Udhari (Credit)") },
];
