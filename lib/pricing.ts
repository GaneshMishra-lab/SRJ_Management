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
