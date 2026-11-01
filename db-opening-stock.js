// Copies one of the shop's inventory workbooks (one tab per item type: label, weight, sold and added
// dates) into the Item types and Stock pieces sheets of an opening workbook.
//   node db-opening-stock.js Gold|Silver <inventory.xlsx> [opening workbook]
// A piece with a MinusDate was sold and is left out. Rows of that metal already on the two sheets
// are replaced, so it can be run again after the inventory is brought up to date; other rows are kept.
// Nothing goes into the database: check the result with db-opening-import.js.
import ExcelJS from 'exceljs';
import { existsSync } from 'node:fs';
import { DEFAULT_FILE, SHEETS, plain } from './db-opening-sheets.js';

// The shop's purchase terms for each metal (owner, 2026-11-01). Melting and wastage are in percent,
// making in rupees a gram, extra charges in rupees. `terms` gets the tab, the label and a reader
// for the row's cells; it returns the terms, or a string saying what is wrong.
const METALS = {
  Gold: {
    // Coin is left out for now.
    skip: ['Analytics', 'Coin'],
    terms(type, no) {
      const standard = { melting: 76, wastage: 4, making: 0, extraCharges: 0 }; // 18 ct
      const byType = { Chain: { melting: 84 } }; // 20 ct
      const byLabel = {
        Chain: { 24: { melting: 76 }, 41: { melting: 76 }, 43: { melting: 92 } },
        Bracelet: { 1: { melting: 92 } },
        Locket: { 46: { melting: 92 } },
        Tops: { 53: { melting: 92 } }, // corrected in the app after the load
      };
      return { ...standard, ...byType[type], ...byLabel[type]?.[no] };
    },
    labelled: { Chain: [24, 41, 43], Bracelet: [1], Locket: [46], Tops: [53] },
    // Pieces whose gross weight differs from the net: the tab's Weight is then the net.
    gross: { Chain: { 24: 29.18 } },
  },
  Silver: {
    // Langdi, Coin and chammach are counted by weight or piece, not labelled; Locket is not yet in stock.
    skip: ['Data', 'Langdi', 'Coin', 'chammach', 'Locket'],
    // A sheet name cannot hold a slash, so the download drops it.
    names: { FerwaJodvi: 'Ferwa/Jodvi' },
    terms(type, no, cell) {
      const melting = cell('melting');
      if (melting !== null && Number(melting) !== 925) return `melting "${melting}" is not 925 or empty`;
      return { melting: melting === null ? 70 : 92.5, wastage: 0, making: 0, extraCharges: 0 };
    },
    labelled: {},
    gross: {},
  },
};

const [metal, source, target = DEFAULT_FILE] = process.argv.slice(2);
const rules = METALS[metal];
if (!rules || !source || !existsSync(source) || !existsSync(target)) {
  console.error('Usage: node db-opening-stock.js Gold|Silver <inventory.xlsx> [opening workbook]');
  console.error('The opening workbook must exist: make it with node db-opening-template.js');
  process.exit(1);
}

const problems = [];
const notes = [];
const today = new Date().toISOString().slice(0, 10);

function value(cell) {
  let v = cell.value;
  if (v && typeof v === 'object' && !(v instanceof Date)) v = 'result' in v ? v.result : 'richText' in v ? v.richText.map((part) => part.text).join('') : null;
  if (typeof v === 'string') v = v.trim();
  return v === '' || v === undefined ? null : v;
}

// The inventories write days as 22|01|24 or 16-11-25; slashes, dots and four-figure years are read too.
// A day the Google Sheet turned into a date of its own was typed day first but read month first
// (07-09-2025 became 9 July), so its day and month are swapped back.
function toDay(v) {
  if (v instanceof Date) v = `${v.getUTCMonth() + 1}-${v.getUTCDate()}-${v.getUTCFullYear()}`;
  const m = String(v).match(/^(\d{1,2})\s*[|/.\-]\s*(\d{1,2})\s*[|/.\-]\s*(\d{2}|\d{4})$/);
  if (!m) return null;
  const day = `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const date = new Date(`${day}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === day ? day : null;
}

const source_ = new ExcelJS.Workbook();
await source_.xlsx.readFile(source);

const types = [];
const pieces = [];
const summary = {};
for (const sheet of source_.worksheets) {
  if (rules.skip.includes(sheet.name)) continue;
  const type = rules.names?.[sheet.name] ?? sheet.name.trim();
  const at = new Map();
  let lastHeading = 0;
  sheet.getRow(1).eachCell((cell, index) => {
    if (value(cell) === null) return;
    at.set(plain(value(cell)), index);
    lastHeading = Math.max(lastHeading, index);
  });
  // The label column is headed No., Label No., Lable No. or Label, or not at all when it is the first.
  const labelAt = ['no', 'labelno', 'lableno', 'label'].map((header) => at.get(header)).find(Boolean)
    ?? (value(sheet.getRow(1).getCell(1)) === null ? 1 : null);
  if (!labelAt || !at.has('weight')) {
    problems.push(`${type}: no label and "Weight" headings in the first row, tab skipped`);
    continue;
  }
  // A tab with no MinusDate heading keeps its sale dates in the column after the last heading.
  const minusAt = at.get('minusdate') ?? lastHeading + 1;
  const read = (row, index) => (index ? value(row.getCell(index)) : null);

  const seen = new Set();
  let top = 0;
  let inStock = 0;
  let grams = 0;
  sheet.eachRow((row, n) => {
    if (n === 1) return;
    const label = read(row, labelAt);
    let weight = read(row, at.get('weight'));
    if (label === null) return; // a total, or an empty line
    const where = `${type} ${label} (row ${n})`;
    if (!Number.isInteger(Number(label)) || Number(label) <= 0) return problems.push(`${where}: the label is not a whole number`);
    if (weight === null) return; // a number written ahead for pieces not yet in
    const no = Number(label);
    if (seen.has(no)) problems.push(`${where}: label ${no} is on the tab twice`);
    seen.add(no);
    top = Math.max(top, no);

    // Any sale date means sold, even one mistyped: the day itself is not loaded.
    if (read(row, minusAt) !== null) return;
    const plus = read(row, at.get('plusdate'));
    const added = plus === null ? null : toDay(plus);

    if (typeof weight === 'string' && /\*$/.test(weight)) {
      notes.push(`${where}: weight "${weight}" read as ${weight.replace(/\*$/, '')}`);
      weight = weight.replace(/\*$/, '');
    }
    const netWeight = Number(weight);
    if (!Number.isFinite(netWeight) || netWeight <= 0) return problems.push(`${where}: weight "${weight}" is not a number above zero`);
    const grossWeight = rules.gross[type]?.[no] ?? netWeight;
    if (grossWeight < netWeight) problems.push(`${where}: gross ${grossWeight} set here is less than the tab's weight ${netWeight}`);
    if (plus !== null && !added) problems.push(`${where}: PlusDate "${plus}" is not a real date`);
    if (added && added > today) problems.push(`${where}: PlusDate ${added} is after today`);
    if (plus instanceof Date) notes.push(`${where}: PlusDate stored as a date, read with day and month swapped back: ${added}`);

    const terms = rules.terms(type, no, (header) => read(row, at.get(header)));
    if (typeof terms === 'string') return problems.push(`${where}: ${terms}`);
    pieces.push({ type, metal, label: no, gross: grossWeight, net: grossWeight === netWeight ? null : netWeight, ...terms, date: added });
    inStock += 1;
    grams += grossWeight;
  });
  for (const label of new Set([...(rules.labelled[type] ?? []), ...Object.keys(rules.gross[type] ?? {}).map(Number)])) {
    if (!pieces.some((piece) => piece.type === type && piece.label === label)) {
      problems.push(`${type} ${label}: has its own terms set here, but is not in stock on the tab`);
    }
  }
  types.push({ name: type, metal, loose: 'no', nextLabel: top + 1 });
  summary[type] = { 'in stock': inStock, grams: Math.round(grams * 1000) / 1000, 'next label': top + 1 };
}

// ---- Writing the opening workbook ----

const target_ = new ExcelJS.Workbook();
await target_.xlsx.readFile(target);
function replaceMetal(sheetName, records) {
  const sheet = SHEETS.find((one) => one.name === sheetName);
  const worksheet = target_.getWorksheet(sheetName);
  const at = new Map();
  worksheet.getRow(1).eachCell((cell, index) => at.set(plain(value(cell)), index));
  const missing = sheet.columns.filter((column) => !at.has(plain(column.header)));
  if (missing.length > 0) {
    console.error(`${target} has no ${missing.map((column) => `"${column.header}"`).join(', ')} heading on ${sheetName}.`);
    console.error('It was made before those columns were added. If nothing is typed in it, delete it and run node db-opening-template.js again.');
    process.exit(1);
  }
  // The rows of other metals are kept, the rest blanked, and all written back from row 2. Cells are
  // emptied rather than rows removed: the template's formatted rows do not splice reliably in exceljs.
  const metalAt = at.get('metal');
  const width = Math.max(...at.values());
  const kept = [];
  const last = worksheet.rowCount;
  for (let n = 2; n <= last; n++) {
    const row = worksheet.getRow(n);
    const cells = Array.from({ length: width }, (_, i) => row.getCell(i + 1).value);
    if (cells.some((v) => v !== null && v !== undefined && v !== '') && value(row.getCell(metalAt)) !== metal) kept.push(cells);
    for (let i = 1; i <= width; i++) row.getCell(i).value = null;
  }
  let next = 2;
  for (const cells of kept) {
    const row = worksheet.getRow(next++);
    cells.forEach((v, i) => { row.getCell(i + 1).value = v; });
  }
  for (const record of records) {
    const row = worksheet.getRow(next++);
    for (const column of sheet.columns) {
      let v = record[column.key];
      if (v === undefined || v === null) continue;
      if (column.type === 'date') v = new Date(`${v}T00:00:00Z`);
      row.getCell(at.get(plain(column.header))).value = v;
    }
  }
}
replaceMetal('Item types', types);
replaceMetal('Stock pieces', pieces);

console.table(summary);
console.log(`${pieces.length} ${metal.toLowerCase()} pieces in stock, ${Math.round(pieces.reduce((sum, piece) => sum + piece.gross, 0) * 1000) / 1000} g.`);
for (const note of notes) console.log(`Note: ${note}`);
if (problems.length > 0) {
  console.error(`\n${problems.length} thing${problems.length === 1 ? '' : 's'} to put right in ${source}:`);
  for (const one of problems) console.error(`  ${one}`);
}
await target_.xlsx.writeFile(target);
console.log(`\nWritten to ${target}. Check it with: node --env-file=.env.local db-opening-import.js ${target} --cutover YYYY-MM-DD`);
