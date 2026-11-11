export const GST_PCT = 3;

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const round3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;

// Rate for a piece of given purity: fine rate × melting ÷ 100.
export const purityRate = (fineRate: number, melting: number) => round2((fineRate * melting) / 100);

// Customer sale line: net weight × purity rate, plus making % (wastage included), plus GST.
export function priceSaleLine(line: { netWeight: number; rate: number; makingPct: number }) {
  const metalValue = round2(line.netWeight * line.rate);
  const makingAmt = round2((metalValue * line.makingPct) / 100);
  const gst = round2(((metalValue + makingAmt) * GST_PCT) / 100);
  return { metalValue, makingAmt, gst, amt: round2(metalValue + makingAmt + gst) };
}

// The other way round: the making % that brings a line to a final price (GST included), for when
// the price is agreed first. Kept to 3 decimals, as the bill stores it, and chosen so the line
// comes to the price exactly where it can (otherwise within a few paise). Null when the price is
// below metal value plus GST, as making cannot be negative.
export function makingPctFor(line: { netWeight: number; rate: number }, finalAmt: number): number | null {
  const metalValue = round2(line.netWeight * line.rate);
  if (!(metalValue > 0) || !(finalAmt > 0)) return null;
  if (finalAmt < priceSaleLine({ ...line, makingPct: 0 }).amt) return null;
  const estimate = Math.round(((finalAmt / (1 + GST_PCT / 100) / metalValue - 1) * 100) * 1000) / 1000;
  let best: number | null = null;
  let bestGap = Infinity;
  for (let k = -30; k <= 30; k++) {
    const pct = Math.round((estimate + k / 1000) * 1000) / 1000;
    if (pct < 0) continue;
    const gap = Math.abs(priceSaleLine({ ...line, makingPct: pct }).amt - finalAmt);
    if (gap < bestGap - 1e-9) {
      best = pct;
      bestGap = gap;
    }
  }
  return best;
}

// What a bought piece costs at a rate per gram of fine metal, the way a purchase bill prices it:
// fine weight (net × (melting + wastage) ÷ the rate's purity) at that rate, plus the making per
// gram of net weight and any extra charges. The daily rate is for pure metal, so purity 100.
export function pieceCost(
  piece: { netWeight: number; melting: number; wastage: number; making: number; extraCharges: number },
  rate: number,
  purity = 100,
) {
  const fine = round3((piece.netWeight * (piece.melting + piece.wastage)) / purity);
  return { fine, amt: round2(fine * rate + piece.netWeight * piece.making + piece.extraCharges) };
}
