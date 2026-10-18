// Makes the empty workbook the shop's opening figures are typed into.
//   node db-opening-template.js [file]
// The file is opening/opening-data.xlsx unless another is named. One that is already there is
// never written over: it may hold typed data.
import ExcelJS from 'exceljs';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DEFAULT_FILE, SHEETS } from './db-opening-sheets.js';

const file = process.argv[2] ?? DEFAULT_FILE;
if (existsSync(file)) {
  console.error(`${file} is already there. Rename or delete it first, or name another file.`);
  process.exit(1);
}

const workbook = new ExcelJS.Workbook();
const heading = { bold: true, size: 12 };

const readMe = workbook.addWorksheet('Read me');
readMe.getColumn(1).width = 22;
readMe.getColumn(2).width = 110;
readMe.getColumn(2).alignment = { wrapText: true, vertical: 'top' };
readMe.getColumn(1).alignment = { vertical: 'top' };
const lines = [
  ['Opening data', 'How the shop stands at the close of the day before it is first kept in the app. Nothing from before that day is entered: only what is in hand and what is still open.'],
  [],
  ['Rules', 'One row for each thing. Do not rename the sheets or the headings in the first row.'],
  ['', 'A heading with a * must be filled. A heading with a small red corner has a note: point at it to read it.'],
  ['', 'Weights are in grams, money in rupees, melting and purity in percent (91.6, not 916).'],
  ['', 'Dates are written day, month, year: 15/08/2025.'],
  ['', 'Spell a person\'s name the same way on every sheet. A sheet with nothing to enter is left empty.'],
  [],
  ['Sheets', ''],
  ...SHEETS.map((sheet) => [sheet.name, sheet.about]),
  [],
  ['Loading', 'Check the workbook, with nothing saved:   node --env-file=.env.local db-opening-import.js --cutover 2026-11-01'],
  ['', 'Save it, once the totals match the books:   node --env-file=.env.local db-opening-import.js --cutover 2026-11-01 --apply'],
  ['', 'The cutover is the first day entries will be made in the app.'],
];
for (const line of lines) readMe.addRow(line);
readMe.getRow(1).font = heading;
readMe.eachRow((row) => { row.getCell(1).font = { bold: true, ...(row.number === 1 ? heading : {}) }; });

for (const sheet of SHEETS) {
  const worksheet = workbook.addWorksheet(sheet.name, { views: [{ state: 'frozen', ySplit: 1 }] });
  const last = sheet.rows ?? 2000;
  worksheet.columns = sheet.columns.map((column) => ({
    header: column.required ? `${column.header} *` : column.header,
    width: Math.max(14, column.header.length + 6, column.type === 'text' ? 24 : 0),
  }));

  sheet.columns.forEach((column, index) => {
    const cell = worksheet.getRow(1).getCell(index + 1);
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: column.required ? 'FFFDE9C8' : 'FFEDEDED' } };
    cell.border = { bottom: { style: 'thin' } };
    if (column.note) cell.note = column.note;

    const letter = worksheet.getColumn(index + 1).letter;
    const range = `${letter}2:${letter}${last}`;
    if (Array.isArray(column.type)) {
      worksheet.dataValidations.add(range, {
        type: 'list', allowBlank: true, formulae: [`"${column.type.join(',')}"`],
        showErrorMessage: true, errorTitle: column.header, error: `Choose one of: ${column.type.join(', ')}`,
      });
    }
    // Kept as text so that a phone number or an HUID does not lose its leading zeros.
    if (column.type === 'text') worksheet.getColumn(index + 1).numFmt = '@';
    if (column.type === 'date') worksheet.getColumn(index + 1).numFmt = 'dd/mm/yyyy';
  });
}

mkdirSync(dirname(file), { recursive: true });
await workbook.xlsx.writeFile(file);
console.log(`Made ${file} with ${SHEETS.length} sheets.`);
