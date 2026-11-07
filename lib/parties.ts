import { round2 } from "@/lib/pricing";

type Balance = {
  saleDue: number | null;
  repairDue: number | null;
  loanDue: number | null;
  goldLoanPrincipalDue: number | null;
  supplierReturnDue: number | null;
  billDue: number | null;
  lendDue: number | null;
  oldItemDue: number | null;
};

// One row of the entity_balance view, added up both ways. Gold loan interest is not included.
export function partyTotals(row: Balance) {
  return {
    owesShop: round2((row.saleDue ?? 0) + (row.repairDue ?? 0) + (row.loanDue ?? 0) + (row.goldLoanPrincipalDue ?? 0) + (row.supplierReturnDue ?? 0)),
    shopOwes: round2((row.billDue ?? 0) + (row.lendDue ?? 0) + (row.oldItemDue ?? 0)),
  };
}
