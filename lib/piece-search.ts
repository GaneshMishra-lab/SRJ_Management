// Finding a labelled piece by what is on its tag or in the hand. Every word typed must match:
// "45" or "#45" is a label, "3.29" a weight (net or gross, read from the left), and any other
// word a type name, metal, HUID or status. So "ring 45" is one piece, and "chain 8." every chain
// of 8 point something grams.

export type SearchablePiece = {
  id: string;
  label: number | null;
  typeName: string | null;
  metal: string | null;
  netWeight: number | null;
  grossWeight?: number | null;
  huid?: string | null;
  status: string | null;
};

const statusWords: Record<string, string> = {
  stock: "in stock",
  on_approval: "on approval",
  sold: "sold",
  returned_to_supplier: "returned to supplier",
  melted: "melted",
};

function wordMatches(word: string, piece: SearchablePiece) {
  const huid = piece.huid?.toLowerCase() ?? "";
  const label = /^#(\d+)$/.exec(word);
  if (label) return piece.label === Number(label[1]);
  if (/^\d+$/.test(word)) return piece.label === Number(word) || huid.includes(word);
  if (/^\d*\.\d*$/.test(word) && word !== ".") {
    const typed = word.startsWith(".") ? `0${word}` : word;
    return [piece.netWeight, piece.grossWeight].some((weight) => weight != null && weight.toFixed(3).startsWith(typed));
  }
  return [piece.typeName, piece.metal, statusWords[piece.status ?? ""]].some((text) => text?.toLowerCase().includes(word)) || huid.includes(word);
}

// Pieces still in the shop come first, then an exact label, then by type and label.
export function searchPieces<T extends SearchablePiece>(pieces: T[], query: string): T[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const labels = words.map((word) => /^#?(\d+)$/.exec(word)?.[1]).filter(Boolean).map(Number);
  const inShop = (piece: T) => (piece.status === "stock" || piece.status === "on_approval" ? 0 : 1);
  const exact = (piece: T) => (piece.label != null && labels.includes(piece.label) ? 0 : 1);
  return pieces
    .filter((piece) => words.every((word) => wordMatches(word, piece)))
    .sort((a, b) =>
      inShop(a) - inShop(b) ||
      exact(a) - exact(b) ||
      (a.typeName ?? "").localeCompare(b.typeName ?? "") ||
      (a.label ?? 0) - (b.label ?? 0),
    );
}
