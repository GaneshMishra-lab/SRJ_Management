# SRJ schema spec (for sign-off)

Status: implemented in `db/schema/` and `drizzle/0003_spec_alignment.sql`. The Eraser file is outdated.

Scope: one shop, one owner, several staff, one bank account.

## 1. Rules that apply everywhere

- **Units**: money is always ₹, metal is always grams. A column never holds one or the other depending on a mode.
- **Number types**: weights and money move from `real` (floating point) to exact decimals: grams to 3 places, ₹ to 2 places. Floats cause rounding drift in ledgers.
- **Naming**: `tunch` is renamed `melting` everywhere (purity %, decimal).
- **Standards**: fine metal is expressed in a standard: `995`, `999` or `100`. Converting between them: grams × from-standard ÷ to-standard.
- **Payment lines**: every "paid so far" total is backed by dated payment rows, and each ledger entry points to the payment row that caused it.
- **Ledger writes happen once**: an adjustment that moves no cash or metal (order advance applied to a sale, old gold set against a bill) writes no ledger entry.

## 2. People and access

| Table | Change |
|---|---|
| `entity` | `type` is exactly one of `customer`, `supplier`, `staff`. Refiners, bullion dealers and karigars are suppliers. |
| `users` | Add `entity` (link to a staff entity; empty for the owner). Roles become `owner`, `staff`; `customer` is removed since customers never log in. |
| `audit_log` | Unchanged. Visible to the owner only: who changed what, and when. |

## 3. Masters

| Table | Columns | Notes |
|---|---|---|
| `item_type` | name, metal, desc, **next_label** | `next_label` drives system-assigned labels per type. |
| `daily_rate` (new) | date, metal, rate | ₹ per gram of fine. Two rows a day (gold, silver), entered by staff. Until today's is entered, the most recent earlier rate applies. |

Purity rate for a piece = daily rate × melting ÷ 100.

## 4. Supplier purchase

**`bill`**: supplier, date, **metal** (gold or silver, never mixed), **standard** (995 / 999 / 100), rate (₹ per gram fine, fixed on bill date), bill_amt, fine, paid_amt.

**`item_purchased`** (cost side of one physical piece): bill, wastage (%), making (₹ per gram), extra_charges (₹), amt, order (optional link to `item_order`). The piece's description lives on `item_stock`.

Formulas, per piece:

- fine = net weight × (melting + wastage) ÷ standard (99.5, 99.9 or 100)
- amt = fine × rate + net weight × making + extra_charges

`bill.fine` and `bill.bill_amt` are the sums over the pieces.

**`bill_payment`**: bill, date, mode, **amt** (₹, always filled), **fine_weight** (grams, for metal modes), **standard** (of the metal given).

| Mode | amt | Ledger written |
|---|---|---|
| cash | as paid | `cash_ledger` out, vault |
| online | as paid | `cash_ledger` out, account |
| fine | fine_weight (converted to bill standard) × bill rate | `metal_ledger` out |
| langdi | langdi fine (see section 8, converted to bill standard) × bill rate | `langdi_ledger` out |
| return_credit | value of a supplier return | none |

**`supplier_return`** (new): date, supplier, stock piece, original bill (reference only, the bill is not changed), amt, fine. Settled separately through **`supplier_return_settlement`** lines: date, mode (cash, online, fine, or credit against a later bill), amt, fine_weight. Cash and fine settlements write to the matching ledger as "in".

## 5. Stock

**`item_stock`** (one row per physical piece, self-describing): date, **item_type**, **metal**, **gross_weight**, **net_weight**, **melting**, **huid** (optional, gold only), label, status, and exactly one source: `item` (purchase) or `old_item_source` (refurbished).

- Net weight defaults to gross; they differ only for studded pieces.
- `label` is unique per item type, system-assigned, never reused.
- Status: `stock`, `on_approval`, `sold`, `returned_to_supplier`, `melted`.
- A refurbished old item gets its type, weights and melting filled in at refurbish time.
- A melted piece becomes a `langdi_ledger` "in" entry.

**`item_approval`** (new): stock piece, entity holding it, date_out, date_back, outcome (`returned` or `sold`), note.

## 6. Customer sale

**`item_sale_bill`**: date, customer, order (optional), computed_amt, **discount**, total_amt, paid_amt.

**`item_sale`** (one line per piece): bill, stock piece, **rate** (purity rate used), **making_pct** (x%, wastage included), metal_value, making_amt, **gst** (3%), amt.

- metal_value = net weight × purity rate
- making_amt = metal_value × making_pct ÷ 100
- gst = 3% of (metal_value + making_amt)
- bill total = sum of line amounts − discount (discount is how a negotiated lump sum is recorded)

**`item_sale_details`** (payments): sale, date, amt_paid, **mode**.

| Mode | Ledger written |
|---|---|
| cash / online | `cash_ledger` in, vault / account |
| old_item | none (the old item row links to the bill and its `amt` is the value) |
| order_advance | none (cash was already recorded when the advance was taken) |

## 7. Orders and repairs

**`item_order`**: customer, date, name, **metal**, weight, **melting** (decimal), status (`order taken`, `being made`, `at shop`, `dispatched`), **rate_booked** (yes/no), **booked_rate**, amt, amt_paid.

- Flow: order → supplier bill line (`item_purchased.order`) → `item_stock` → `item_sale`.
- If the rate is booked, the sale uses `booked_rate`; otherwise the delivery day's rate.
- Advances are rows in **`item_order_payment`** (date, amt, mode) and write to `cash_ledger` when received. At delivery the total advance becomes one `order_advance` line on the sale bill.

**`item_repairing`**: customer, desc, **received_date**, **received_weight**, status (`taken`, `sent for repair`, `repaired`, `returned`), **karigar** (supplier, optional), **sent_date**, **done_date**, **returned_date**, **returned_weight**, amt, paid_amt. Payments in **`item_repairing_payment`** (date, amt, mode).

## 8. Old gold and langdi

**`old_item`**: customer, date, weight, metal (`gold`, `silver`, `phuli`), melting, amt (agreed value), paid_amt (paid out so far), sale_bill (optional), order (optional), **gold_loan** (optional, set when a defaulted pledge comes in), status (`vault`, `melted`, `refurbished`), processed_date, **langdi_entry** (the melt it went into).

- Payouts to the customer are rows in **`old_item_payment`** and write to `cash_ledger` out.
- Phuli is low-purity gold, stored apart and melted into its own lower-purity langdi.

**`langdi_ledger`** (new): langdi is tracked by weight, with piece count as an informal note.

| Column | Meaning |
|---|---|
| date, metal, direction | in (melt) or out (traded away) |
| weight, pieces | grams; pieces is a soft count |
| est_purity | reference only, entered at melt |
| tested_purity | entered by staff after testing |
| refining_deduction | grams knocked off by the dealer (4.45 g counted as 4.42 g) |
| fine_weight, standard | result of the conversion, on "out" entries |
| source_table, source_id | melt, bullion trade, supplier bill payment, or cash sale |
| entity, amt, mode, desc | buyer and money received, filled only when langdi is sold for cash |

`old_item.langdi_entry` and `item_stock.langdi_entry` point to the melt entry a piece went into.

fine = (weight − refining_deduction) × tested_purity ÷ standard of the bullion received.

Langdi can go out three ways: traded for bullion (`fine_trade`), given to a supplier against a bill (`bill_payment` mode langdi), or sold for cash.

## 9. Fine bullion

**`fine_trade`** (renamed from `fine_purchase`): date, **type** (purchase or sale), entity, metal, **standard**, weight, rate, amt, mode (cash, online, langdi).

**`metal_ledger`**: date, metal, **standard**, direction, weight, source_table, source_id, desc. Fine metal only; ornaments are never in it. Balances are separate per metal and per standard (995 and 999).

What writes to it: bullion bought (in), bullion sold (out), langdi traded for bullion (in), fine paid to a supplier (out), supplier return settled in fine (in).

## 10. Gold loan (girvi)

**`gold_loan`**: customer, item (free text, may list several items), **desc**, weight, date, amt, amt_paid (principal only), interest (% per month, simple), **status** (`active`, `closed`, `defaulted`).

**`gold_loan_payment`**: loan, date, amt, type (interest or principal), **mode**, desc.

On default the pledge becomes an `old_item` valued at outstanding principal plus unpaid interest.

## 11. Loan and lend

- `loan` is money the shop gave; `lend` is money the shop took. Pure cash only.
- One account per entity. Each amount given and each repayment is a dated line: **`loan_entry`** and **`lend_entry`** (date, type `given` or `repayment`, amt, mode), replacing the repayment tables. Totals are calculated from the lines.
- Dues from bills, sales and repairs stay on their own tables. A per-entity **balance view** adds everything up: what the entity owes the shop and what the shop owes the entity.

## 12. Cash

- **`cash_ledger`**: unchanged shape. `location` is `vault` (shop cash) or `account` (the one bank account). Every cash-moving table writes to it, including `expense` and `misc_trade`.
- **`daily_balance`**: unchanged. Hand-counted closing against computed closing, per location.
- **`daily_metal_balance`** (new): the same daily tally for fine metal, per metal and standard.
- **`expense`**, **`misc_category`**, **`misc_item`**, **`misc_trade`**: unchanged. `misc_trade.qty` stays a whole number.

## 13. Points I decided that you have not explicitly confirmed

1. **Bill balance**: the ₹ balance is the master. Outstanding fine is shown as remaining ₹ ÷ bill rate, so making and extra charges can also be cleared in metal. `bill.fine` stays as the original metal content of the bill.
2. **Langdi as a weight ledger**: purity is recorded on each entry rather than per piece, since you track total weight.
3. **Payment tables** for order advances, repairs and old-item payouts, so every cash ledger entry has a row to point to.
4. **Exact decimals** instead of `real` for weights and money.
