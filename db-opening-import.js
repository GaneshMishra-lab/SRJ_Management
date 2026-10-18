// Loads the shop's opening figures from the workbook made by db-opening-template.js, in one transaction.
//   node --env-file=.env.local db-opening-import.js [file] --cutover 2026-11-01            dry run, rolled back
//   node --env-file=.env.local db-opening-import.js [file] --cutover 2026-11-01 --apply    commit
// The cutover is the first day entries are made in the app. Everything loaded is dated before it,
// so that day's book opens on the cash loaded here and shows none of it as a movement.
//
// Money that changed hands before the cutover writes nothing to cash_ledger: an old due, an
// advance already taken and a girvi already given are loaded as they stand. Only the cash, fine
// metal and langdi in hand go into their ledgers, as the adjustments the app already has for them.
// Every row loaded is listed in audit_log with an `openingImport` mark, so a load can be traced.
// A second load is refused unless --again is given.
import ExcelJS from 'exceljs';
import { Pool } from '@neondatabase/serverless';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { DEFAULT_FILE, SHEETS, plain } from './db-opening-sheets.js';

const args = process.argv.slice(2);
const cutover = args[args.indexOf('--cutover') + 1];
const file = args.find((arg, index) => !arg.startsWith('--') && args[index - 1] !== '--cutover') ?? DEFAULT_FILE;
const apply = args.includes('--apply');

const realDay = (day) => /^\d{4}-\d{2}-\d{2}$/.test(day ?? '') && new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) === day;
if (!args.includes('--cutover') || !realDay(cutover)) {
  console.error('Usage: node --env-file=.env.local db-opening-import.js [file] --cutover YYYY-MM-DD [--apply]');
  process.exit(1);
}
if (!existsSync(file)) {
  console.error(`${file} was not found. Make it with: node db-opening-template.js`);
  process.exit(1);
}

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const round3 = (n) => Math.round((n + Number.EPSILON) * 1000) / 1000;
// Timestamps are stored as UTC without a zone; an entry known only by its day is put at noon on the shop's clock.
const noon = (day) => `${day}T06:30:00.000Z`;
const eve = new Date(new Date(`${cutover}T00:00:00Z`).getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

const errors = [];
const notes = [];
const problem = (sheet, row, message) => errors.push(`${sheet}${row ? `, row ${row}` : ''}: ${message}`);

// ---- Reading the workbook ----

function value(cell) {
  let v = cell.value;
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    v = 'result' in v ? v.result : 'richText' in v ? v.richText.map((part) => part.text).join('') : 'text' in v ? v.text : null;
    if (v && typeof v === 'object' && !(v instanceof Date)) v = null;
  }
  if (typeof v === 'string') v = v.trim();
  return v === '' || v === undefined ? null : v;
}

function toNumber(v) {
  if (typeof v === 'number') return v;
  if (typeof v !== 'string') return NaN;
  const cleaned = v.replace(/[,\s₹]|rs\.?|g(m|ms|ram|rams)?$|%$/gi, '');
  return cleaned === '' ? NaN : Number(cleaned);
}

function toDay(v) {
  // Excel hands a date over as midnight UTC of that day, or as a count of days when the cell is not formatted as one.
  if (typeof v === 'number') v = new Date(Math.round((v - 25569) * 86400000));
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  const text = String(v);
  const dmy = text.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2}|\d{4})$/);
  const ymd = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  const [y, m, d] = dmy ? [dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3], dmy[2], dmy[1]] : ymd ? [ymd[1], ymd[2], ymd[3]] : [];
  const day = y && `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  return day && realDay(day) ? day : null;
}

function parse(sheet, row, column, v) {
  if (v === null) {
    if (column.required) problem(sheet, row, `"${column.header}" is empty`);
    return null;
  }
  if (Array.isArray(column.type)) {
    const choice = column.type.find((option) => option.toLowerCase() === String(v).toLowerCase());
    if (!choice) problem(sheet, row, `"${column.header}" is "${v}"; it must be one of: ${column.type.join(', ')}`);
    return choice ?? null;
  }
  if (column.type === 'text') return v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
  if (column.type === 'date') {
    const day = toDay(v);
    if (!day) problem(sheet, row, `"${column.header}" is "${v}"; write a date as day/month/year`);
    else if (!column.future && day >= cutover) problem(sheet, row, `"${column.header}" is ${day}, which is not before the cutover (${cutover})`);
    return day;
  }
  const n = toNumber(v);
  if (!Number.isFinite(n) || n < 0) {
    problem(sheet, row, `"${column.header}" is "${v}"; it must be a number, zero or more`);
    return null;
  }
  if (column.type === 'int' && !Number.isInteger(n)) {
    problem(sheet, row, `"${column.header}" is ${n}; it must be a whole number`);
    return null;
  }
  return n;
}

async function readWorkbook() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(file);
  const names = new Set(['Read me', ...SHEETS.map((sheet) => sheet.name)]);
  for (const worksheet of workbook.worksheets) {
    if (!names.has(worksheet.name)) problem(worksheet.name, 0, 'this sheet is not one the import knows; was it renamed?');
  }

  const data = {};
  for (const sheet of SHEETS) {
    data[sheet.name] = [];
    const worksheet = workbook.getWorksheet(sheet.name);
    if (!worksheet) continue;

    const at = new Map();
    worksheet.getRow(1).eachCell((cell, index) => at.set(plain(value(cell)), index));
    const missing = sheet.columns.filter((column) => !at.has(plain(column.header)));
    if (missing.length > 0) {
      problem(sheet.name, 1, `heading not found: ${missing.map((column) => column.header).join(', ')}`);
      continue;
    }
    worksheet.eachRow((row, number) => {
      if (number === 1) return;
      const cells = sheet.columns.map((column) => value(row.getCell(at.get(plain(column.header)))));
      if (cells.every((cell) => cell === null)) return;
      const record = { row: number };
      sheet.columns.forEach((column, index) => { record[column.key] = parse(sheet.name, number, column, cells[index]); });
      data[sheet.name].push(record);
    });
  }
  return data;
}

// ---- Turning the sheets into rows ----

// Parent tables before the ones that point at them.
const TABLES = [
  'entity', 'item_type', 'misc_category', 'misc_item', 'item_purchased', 'item_stock', 'item_approval', 'loose_stock_ledger',
  'misc_trade', 'cash_ledger', 'metal_ledger', 'langdi_ledger', 'old_item', 'gold_loan', 'gold_loan_payment',
  'loan', 'loan_entry', 'lend', 'lend_entry', 'bill', 'item_order', 'item_order_payment', 'item_repairing', 'item_repairing_payment',
  'bc', 'bc_payment',
];
const rows = Object.fromEntries(TABLES.map((table) => [table, []]));
const add = (table, row) => {
  const withId = { id: randomUUID(), ...row };
  rows[table].push(withId);
  return withId.id;
};

const nameKey = (name) => name.trim().replace(/\s+/g, ' ').toLowerCase();
const percent = (sheet, row, header, n) => {
  if (n !== null && (n <= 0 || n > 100)) problem(sheet, row, `"${header}" is ${n}; it must be a percentage above 0 and up to 100`);
};
const above0 = (sheet, row, header, n) => {
  if (n !== null && n <= 0) problem(sheet, row, `"${header}" must be above zero`);
};

function build(data, existing) {
  // People: those the app has, then those named in the workbook.
  const people = new Map();
  for (const person of existing.entities) {
    if (!person.name) continue;
    people.set(nameKey(person.name), [...(people.get(nameKey(person.name)) ?? []), person]);
  }
  const person = (sheet, row, name, type, contact) => {
    const found = people.get(nameKey(name)) ?? [];
    const match = found.length > 1 ? found.filter((one) => one.type === type) : found;
    if (match.length === 1) return match[0].id;
    if (found.length > 1) {
      problem(sheet, row, `the app has more than one party named "${name}"; rename one of them so they can be told apart`);
      return found[0].id;
    }
    const id = add('entity', { name: name.trim().replace(/\s+/g, ' '), type, contact: contact ?? null });
    people.set(nameKey(name), [{ id, type }]);
    return id;
  };

  const listed = new Set();
  for (const r of data['Parties']) {
    if (!r.name || !r.type) continue;
    if (listed.has(nameKey(r.name))) problem('Parties', r.row, `"${r.name}" is listed twice`);
    listed.add(nameKey(r.name));
    if (people.has(nameKey(r.name))) notes.push(`Parties, row ${r.row}: "${r.name}" is already in the app and is left as it is.`);
    else person('Parties', r.row, r.name, r.type, r.contact);
  }

  // Item types, known by name and metal together: a gold Ring and a silver Ring are two types.
  const types = new Map(existing.types.map((type) => [`${nameKey(type.name)}|${type.metal}`, { ...type, isNew: false }]));
  for (const r of data['Item types']) {
    if (!r.name || !r.metal) continue;
    const key = `${nameKey(r.name)}|${r.metal}`;
    const loose = r.loose === 'yes';
    const known = types.get(key);
    if (known) {
      if (known.isNew) problem('Item types', r.row, `${r.metal} "${r.name}" is listed twice`);
      else if (known.loose !== loose) problem('Item types', r.row, `${r.metal} "${r.name}" is already in the app as ${known.loose ? 'a loose' : 'a labelled'} type`);
      continue;
    }
    const row = { name: r.name.trim(), metal: r.metal, loose, pieces_per_gram: loose ? r.piecesPerGram : null, next_label: 1 };
    types.set(key, { id: add('item_type', row), metal: r.metal, loose, isNew: true });
  }
  const typeOf = (sheet, r, loose) => {
    if (!r.type || !r.metal) return null;
    const type = types.get(`${nameKey(r.type)}|${r.metal}`);
    if (!type) problem(sheet, r.row, `${r.metal} "${r.type}" is not on the Item types sheet, and the app does not have it`);
    else if (type.loose !== loose) problem(sheet, r.row, `${r.metal} "${r.type}" is ${type.loose ? 'kept loose by weight, so it belongs on the Loose stock sheet' : 'a labelled type, so it belongs on the Stock pieces sheet'}`);
    return type ?? null;
  };

  // Labelled pieces. A piece must come from a purchased item, so each gets one, with no bill behind it.
  const labels = new Set(existing.stock.map((piece) => `${piece.item_type}|${piece.label}`));
  const huids = new Set(existing.stock.map((piece) => piece.huid).filter(Boolean));
  const topLabel = new Map();
  for (const r of data['Stock pieces']) {
    const sheet = 'Stock pieces';
    const type = typeOf(sheet, r, false);
    const net = r.net ?? r.gross;
    above0(sheet, r.row, 'Gross weight', r.gross);
    above0(sheet, r.row, 'Label', r.label);
    percent(sheet, r.row, 'Melting', r.melting);
    if (net !== null && r.gross !== null && net > r.gross) problem(sheet, r.row, 'net weight is more than gross weight');
    if (r.huid) {
      if (huids.has(r.huid)) problem(sheet, r.row, `HUID ${r.huid} is on another piece`);
      huids.add(r.huid);
    }
    if (!type || r.label === null || r.gross === null || r.melting === null) continue;
    if (labels.has(`${type.id}|${r.label}`)) problem(sheet, r.row, `${r.metal} "${r.type}" already has a piece with label ${r.label}`);
    labels.add(`${type.id}|${r.label}`);
    topLabel.set(type.id, Math.max(topLabel.get(type.id) ?? 0, r.label));

    const date = noon(r.date ?? eve);
    const weights = { item_type: type.id, gross_weight: round3(r.gross), net_weight: round3(net), melting: round3(r.melting) };
    const item = add('item_purchased', { bill: null, ...weights, amt: r.cost === null ? null : round2(r.cost) });
    const piece = add('item_stock', { date, ...weights, metal: r.metal, huid: r.huid, label: r.label, status: r.approval ? 'on_approval' : 'stock', item });
    if (r.approval) {
      add('item_approval', { item: piece, entity: person(sheet, r.row, r.approval, 'customer'), date_out: date, note: 'Out on approval when the books were opened' });
    }
  }
  // Labels given by the app carry on after the highest one loaded.
  const labelsFrom = [];
  for (const [id, top] of topLabel) {
    const fresh = rows.item_type.find((type) => type.id === id);
    if (fresh) fresh.next_label = top + 1;
    else labelsFrom.push({ id, next: top + 1 });
  }

  for (const r of data['Loose stock']) {
    const type = typeOf('Loose stock', r, true);
    above0('Loose stock', r.row, 'Weight', r.weight);
    percent('Loose stock', r.row, 'Melting', r.melting);
    if (!type || r.weight === null || r.melting === null) continue;
    add('loose_stock_ledger', {
      date: noon(eve), item_type: type.id, melting: round3(r.melting), direction: 'in', weight: round3(r.weight),
      source_table: 'opening', source_id: null, desc: 'Opening stock',
    });
  }

  // Misc items are counted from their trades, so what is in hand goes in as a purchase already paid for.
  const categories = new Map(existing.categories.map((category) => [nameKey(category.name ?? ''), category.id]));
  const miscItems = new Map(existing.miscItems.map((item) => [`${item.category}|${nameKey(item.name ?? '')}`, item]));
  for (const r of data['Misc stock']) {
    above0('Misc stock', r.row, 'Quantity', r.qty);
    if (!r.category || !r.item || !r.unit || r.qty === null) continue;
    if (!categories.has(nameKey(r.category))) categories.set(nameKey(r.category), add('misc_category', { name: r.category.trim() }));
    const category = categories.get(nameKey(r.category));
    const key = `${category}|${nameKey(r.item)}`;
    if (!miscItems.has(key)) miscItems.set(key, { id: add('misc_item', { category, name: r.item.trim(), unit: r.unit, desc: null }), unit: r.unit });
    const item = miscItems.get(key);
    if (item.unit !== r.unit) problem('Misc stock', r.row, `"${r.item}" is counted by the ${item.unit}, not the ${r.unit}`);
    const amt = round2(r.qty * (r.unitPrice ?? 0));
    add('misc_trade', {
      date: noon(eve), type: 'purchase', entity: person('Misc stock', r.row, 'Opening stock', 'supplier'), item: item.id,
      qty: r.qty, unit_price: round2(r.unitPrice ?? 0), amt, mode: null, paid_amt: amt, due_date: null,
    });
  }

  const once = (sheet, r, seen, key, what) => {
    if (seen.has(key)) problem(sheet, r.row, `${what} is entered twice; give one row with the total`);
    seen.add(key);
  };
  const adjustment = { source_table: 'adjustment', source_id: null };

  const places = new Set();
  for (const r of data['Cash']) {
    if (!r.location || !r.amt) continue;
    once('Cash', r, places, r.location, `the ${r.location}`);
    add('cash_ledger', { date: noon(eve), location: r.location, direction: 'in', amt: round2(r.amt), ...adjustment, desc: 'Adjustment: Opening balance' });
  }
  const bullion = new Set();
  for (const r of data['Fine metal']) {
    if (!r.metal || !r.standard || !r.weight) continue;
    once('Fine metal', r, bullion, `${r.metal}|${r.standard}`, `${r.metal} ${r.standard}`);
    add('metal_ledger', { date: noon(eve), metal: r.metal, standard: r.standard, direction: 'in', weight: round3(r.weight), ...adjustment, desc: 'Adjustment: Opening stock' });
  }
  for (const r of data['Langdi']) {
    above0('Langdi', r.row, 'Weight', r.weight);
    percent('Langdi', r.row, 'Purity', r.purity);
    if (!r.metal || r.weight === null) continue;
    add('langdi_ledger', {
      date: noon(eve), metal: r.metal, direction: 'in', weight: round3(r.weight), pieces: r.pieces,
      est_purity: r.purity === null ? null : round3(r.purity), ...adjustment, desc: 'Adjustment: Opening stock',
    });
  }

  // Bought and paid for before the books were opened, so nothing is owed on it.
  for (const r of data['Old metal']) {
    above0('Old metal', r.row, 'Weight', r.weight);
    percent('Old metal', r.row, 'Melting', r.melting);
    if (!r.metal || r.weight === null || r.melting === null) continue;
    const amt = round2(r.amt ?? 0);
    add('old_item', {
      customer: r.party ? person('Old metal', r.row, r.party, 'customer') : null, date: noon(r.date ?? eve),
      weight: round3(r.weight), metal: r.metal, amt, paid_amt: amt, melting: round3(r.melting), status: 'vault',
    });
  }

  // Girvi keeps its own day and every payment made on it, because interest is counted from them.
  const pledges = new Map();
  for (const r of data['Gold loans']) {
    const sheet = 'Gold loans';
    above0(sheet, r.row, 'Weight', r.weight);
    above0(sheet, r.row, 'Amount', r.amt);
    if (r.interest !== null && r.interest > 100) problem(sheet, r.row, 'interest is a percentage per month');
    else if (r.interest !== null && r.interest > 5) notes.push(`${sheet}, row ${r.row}: interest is ${r.interest}% a month. If that is the rate for a year, divide it by 12.`);
    if (!r.ref || !r.party || !r.item || r.weight === null || !r.date || r.amt === null || r.interest === null) continue;
    if (pledges.has(nameKey(r.ref))) { problem(sheet, r.row, `book no. ${r.ref} is entered twice`); continue; }
    add('gold_loan', {
      customer: person(sheet, r.row, r.party, 'customer', r.contact), item: r.item, desc: [r.note, `Book no. ${r.ref}`].filter(Boolean).join(' · '),
      weight: round3(r.weight), date: noon(r.date), amt: round2(r.amt), amt_paid: 0, interest: round3(r.interest), status: 'active',
    });
    pledges.set(nameKey(r.ref), { loan: rows.gold_loan.at(-1), day: r.date, row: r.row });
  }
  for (const r of data['Gold loan payments']) {
    const sheet = 'Gold loan payments';
    above0(sheet, r.row, 'Amount', r.amt);
    if (!r.ref || !r.date || !r.type || r.amt === null) continue;
    const pledge = pledges.get(nameKey(r.ref));
    if (!pledge) { problem(sheet, r.row, `book no. ${r.ref} is not on the Gold loans sheet`); continue; }
    if (r.date < pledge.day) problem(sheet, r.row, `the payment is dated before loan ${r.ref} was given`);
    if (r.type === 'principal') pledge.loan.amt_paid = round2(pledge.loan.amt_paid + r.amt);
    add('gold_loan_payment', { loan: pledge.loan.id, date: noon(r.date), amt: round2(r.amt), type: r.type, mode: 'opening', desc: null });
  }
  for (const { loan, row } of pledges.values()) {
    if (loan.amt_paid >= loan.amt) problem('Gold loans', row, 'the principal is already repaid in full; leave closed loans out');
  }

  // Money owed to the shop and by it: one running account for each person, opened with what is left.
  const account = (sheet, table, holder, taken, list, accounts) => {
    for (const r of list) {
      above0(sheet, r.row, 'Amount', r.amt);
      if (!r.party || r.amt === null) continue;
      const who = person(sheet, r.row, r.party, 'customer', r.contact);
      if (!accounts.has(who)) accounts.set(who, add(table, { [holder]: who }));
      add(`${table}_entry`, { [table]: accounts.get(who), date: noon(r.date ?? eve), type: taken, amt: round2(r.amt), mode: 'opening' });
    }
  };
  account('Udhari', 'loan', 'borrower', 'given', data['Udhari'], new Map(existing.loans.map((one) => [one.borrower, one.id])));
  account('Borrowed', 'lend', 'lender', 'taken', data['Borrowed'], new Map(existing.lends.map((one) => [one.lender, one.id])));

  // Only what is still owed on a supplier's bill is loaded, as a bill with nothing paid on it yet.
  for (const r of data['Supplier bills']) {
    const sheet = 'Supplier bills';
    above0(sheet, r.row, 'Rate', r.rate);
    if (!r.amt && !r.fine) problem(sheet, r.row, 'give the due amount or the due fine');
    if (!r.party || !r.metal || !r.standard || !r.rate || (!r.amt && !r.fine)) continue;
    add('bill', {
      supplier: person(sheet, r.row, r.party, 'supplier'), date: noon(r.date ?? eve), metal: r.metal, standard: r.standard, rate: round2(r.rate),
      bill_amt: round2(r.amt || r.fine * r.rate), fine: round3(r.fine || r.amt / r.rate), paid_amt: 0, due_date: r.dueDate,
    });
  }

  for (const r of data['Orders']) {
    const sheet = 'Orders';
    percent(sheet, r.row, 'Melting', r.melting);
    if (!r.party || !r.date || !r.name || !r.metal) continue;
    const advance = round2(r.advance ?? 0);
    const order = add('item_order', {
      customer: person(sheet, r.row, r.party, 'customer', r.contact), date: noon(r.date), name: r.name, metal: r.metal,
      weight: r.weight ? round3(r.weight) : null, melting: r.melting ? round3(r.melting) : null, status: r.status ?? 'order taken',
      rate_booked: Boolean(r.bookedRate), booked_rate: r.bookedRate ? round2(r.bookedRate) : null, amt: r.amt ? round2(r.amt) : null, amt_paid: advance,
    });
    if (advance > 0) add('item_order_payment', { order, date: noon(r.date), amt: advance, mode: 'opening' });
  }

  // What was paid into a BC before the start is one opening payment; no cash moves.
  for (const r of data['BC']) {
    const sheet = 'BC';
    above0(sheet, r.row, 'Each month', r.instalment);
    const months = r.months ?? 12;
    const multiplier = r.multiplier ?? 13.5;
    if (months < 1 || months > 60) problem(sheet, r.row, `"Months" is ${months}; it must be from 1 to 60`);
    if (multiplier < months) problem(sheet, r.row, `"Worth" (${multiplier}) cannot be less than "Months" (${months})`);
    if (!r.party || !r.date || !r.instalment || r.paid === null) continue;
    const paid = round2(r.paid);
    if (paid > r.instalment * months) problem(sheet, r.row, 'more is paid than the whole BC');
    const bc = add('bc', {
      customer: person(sheet, r.row, r.party, 'customer', r.contact), card_no: r.cardNo ?? null, start_date: r.date,
      instalment: round2(r.instalment), months, multiplier,
    });
    if (paid > 0) add('bc_payment', { bc, date: noon(eve), amt: paid, mode: 'opening' });
  }

  for (const r of data['Repairs']) {
    const sheet = 'Repairs';
    above0(sheet, r.row, 'Weight', r.weight);
    const paid = round2(r.paid ?? 0);
    if (paid > (r.amt ?? 0)) problem(sheet, r.row, 'more is paid than the charge');
    if (!r.party || !r.desc || !r.date || r.weight === null) continue;
    const repair = add('item_repairing', {
      customer: person(sheet, r.row, r.party, 'customer', r.contact), desc: r.desc, received_date: noon(r.date), received_weight: round3(r.weight),
      status: r.status ?? 'taken', karigar: r.karigar ? person(sheet, r.row, r.karigar, 'supplier') : null, amt: r.amt === null ? null : round2(r.amt), paid_amt: paid,
    });
    if (paid > 0) add('item_repairing_payment', { repair, date: noon(r.date), amt: paid, mode: 'opening' });
  }

  return { labelsFrom };
}

// ---- The database ----

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
const query = async (text, params) => (await client.query(text, params)).rows;

async function insert(table, list) {
  if (list.length === 0) return;
  const columns = Object.keys(list[0]);
  for (let from = 0; from < list.length; from += 200) {
    const params = [];
    const tuples = list.slice(from, from + 200).map((row) => `(${columns.map((column) => `$${params.push(row[column] ?? null)}`).join(', ')})`);
    await client.query(`INSERT INTO "${table}" (${columns.map((column) => `"${column}"`).join(', ')}) VALUES ${tuples.join(', ')}`, params);
  }
}

// What the app's own screens will add up to, read before and after the load.
const position = async () => (await query(`
  SELECT
    (SELECT count(*) FROM item_stock WHERE status IN ('stock', 'on_approval'))::int AS "Labelled pieces",
    (SELECT coalesce(sum(gross_weight), 0) FROM item_stock WHERE status IN ('stock', 'on_approval') AND metal = 'Gold')::float AS "Gold pieces, gross g",
    (SELECT coalesce(sum(gross_weight), 0) FROM item_stock WHERE status IN ('stock', 'on_approval') AND metal = 'Silver')::float AS "Silver pieces, gross g",
    (SELECT coalesce(sum(CASE WHEN direction = 'in' THEN weight ELSE -weight END), 0) FROM loose_stock_ledger)::float AS "Loose metal, g",
    (SELECT coalesce(sum(CASE WHEN direction = 'in' THEN weight ELSE -weight END), 0) FROM metal_ledger)::float AS "Fine metal, g",
    (SELECT coalesce(sum(CASE WHEN direction = 'in' THEN weight ELSE -weight END), 0) FROM langdi_ledger)::float AS "Langdi, g",
    (SELECT count(*) FROM old_item WHERE status = 'vault')::int AS "Old metal in vault",
    (SELECT coalesce(sum(CASE WHEN direction = 'in' THEN amt ELSE -amt END), 0) FROM cash_ledger WHERE location = 'vault')::float AS "Cash in vault",
    (SELECT coalesce(sum(CASE WHEN direction = 'in' THEN amt ELSE -amt END), 0) FROM cash_ledger WHERE location = 'account')::float AS "Bank account",
    (SELECT count(*) FROM gold_loan WHERE status = 'active')::int AS "Gold loans open",
    (SELECT coalesce(sum(gold_loan_principal_due), 0) FROM entity_balance)::float AS "Gold loan principal due",
    (SELECT coalesce(sum(loan_due), 0) FROM entity_balance)::float AS "Udhari owed to the shop",
    (SELECT coalesce(sum(lend_due), 0) FROM entity_balance)::float AS "Borrowed by the shop",
    (SELECT coalesce(sum(bill_due), 0) FROM entity_balance)::float AS "Owed to suppliers",
    (SELECT count(*) FROM item_order WHERE status <> 'dispatched')::int AS "Orders open",
    (SELECT coalesce(sum(amt_paid), 0) FROM item_order WHERE status <> 'dispatched')::float AS "Order advances held",
    (SELECT count(*) FROM item_repairing WHERE status <> 'returned')::int AS "Repairs in hand",
    (SELECT count(*) FROM bc WHERE matured_at IS NULL)::int AS "BCs running",
    (SELECT coalesce(sum(p.amt), 0) FROM bc_payment p JOIN bc ON bc.id = p.bc WHERE bc.matured_at IS NULL)::float AS "Paid into running BCs"
`))[0];

try {
  const data = await readWorkbook();
  await client.query('BEGIN');

  const [{ n: loadedBefore }] = await query(`SELECT count(*)::int AS n FROM audit_log WHERE new_values ? 'openingImport'`);
  if (loadedBefore > 0 && !args.includes('--again')) {
    throw new Error(`Opening data has been loaded before (${loadedBefore} rows carry its mark). Loading it again would count things twice; add --again only for a workbook of things left out the first time.`);
  }

  const existing = {
    entities: await query('SELECT id, name, type FROM entity'),
    types: await query('SELECT id, name, metal, loose FROM item_type'),
    stock: await query('SELECT item_type, label, huid FROM item_stock'),
    categories: await query('SELECT id, name FROM misc_category'),
    miscItems: await query('SELECT id, category, name, unit FROM misc_item'),
    loans: await query('SELECT id, borrower FROM loan'),
    lends: await query('SELECT id, lender FROM lend'),
  };
  const { labelsFrom } = build(data, existing);

  console.log(`\n${file}, opening the books on ${cutover} (figures as at the close of ${eve})\n`);
  console.table(Object.fromEntries(SHEETS.map((sheet) => [sheet.name, { rows: data[sheet.name].length }])));
  for (const note of notes) console.log(`Note: ${note}`);
  if (errors.length > 0) {
    console.error(`\n${errors.length} thing${errors.length === 1 ? '' : 's'} to put right in the workbook:`);
    for (const error of errors) console.error(`  ${error}`);
    throw new Error('Nothing was loaded.');
  }

  const before = await position();
  const [owner] = await query(`SELECT id FROM users WHERE role = 'owner' AND is_active ORDER BY id LIMIT 1`);
  const run = new Date().toISOString();
  const audit = [];
  for (const table of TABLES) {
    await insert(table, rows[table]);
    for (const row of rows[table]) {
      audit.push({ table_name: table, record_id: row.id, action: 'insert', new_values: JSON.stringify({ ...row, openingImport: run }), changed_by: owner?.id ?? null });
    }
  }
  for (const { id, next } of labelsFrom) {
    await client.query('UPDATE item_type SET next_label = greatest(next_label, $2), updated_at = now() WHERE id = $1', [id, next]);
  }
  await insert('audit_log', audit);
  const after = await position();

  console.log('\nRows added:');
  console.table(Object.fromEntries(TABLES.filter((table) => rows[table].length > 0).map((table) => [table, { rows: rows[table].length }])));
  console.log('What the app will show. Compare the "added" column with the books:');
  console.table(Object.fromEntries(Object.keys(before).map((figure) => [figure, { before: before[figure], added: round3(after[figure] - before[figure]), after: after[figure] }])));

  await client.query(apply ? 'COMMIT' : 'ROLLBACK');
  console.log(apply ? 'Loaded.' : 'Dry run OK, rolled back. Re-run with --apply to save.');
} catch (err) {
  await client.query('ROLLBACK').catch(() => {});
  if (errors.length > 0) console.error(`\n${err.message}`);
  else console.error('Failed, rolled back:', err);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
