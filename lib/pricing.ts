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
