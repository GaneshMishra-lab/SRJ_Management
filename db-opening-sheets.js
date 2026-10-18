// The sheets of the opening-data workbook: how the shop stands on the evening before the first day
// it is kept in the app. Shared by db-opening-template.js, which makes the empty workbook, and
// db-opening-import.js, which reads it.
// Column types: text, num, int, date, and a list of allowed words. A date must fall before the
// cutover unless the column is marked `future`.

const METALS = ['Gold', 'Silver'];
const party = (header = 'Party') => [
  { key: 'party', header, required: true, type: 'text', note: 'Spell a name the same way everywhere. Two people of the same name: add the village or a number.' },
  { key: 'contact', header: 'Contact', type: 'text', note: 'Phone number. Only used when the name is new.' },
];
const day = (header = 'Date', required = false) => ({
  key: 'date', header, required, type: 'date', note: `Day, month, year (15/08/2025).${required ? '' : ' Empty means the day before the app starts.'}`,
});

export const SHEETS = [
  {
    name: 'Parties',
    about: 'Customers, suppliers, karigars and staff. Optional: a name used on any other sheet is added by itself. List a person here to give a phone number, or to mark a supplier or staff.',
    columns: [
      { key: 'name', header: 'Name', required: true, type: 'text' },
      { key: 'type', header: 'Type', required: true, type: ['customer', 'supplier', 'staff'], note: 'Karigars, refiners and bullion dealers are suppliers.' },
      { key: 'contact', header: 'Contact', type: 'text' },
    ],
  },
  {
    name: 'Item types',
    about: 'The kinds of ornament the shop labels (Ring, Chain) and the kinds kept loose by weight (mani). Every type used on the two stock sheets must be here, unless the app already has it.',
    columns: [
      { key: 'name', header: 'Name', required: true, type: 'text' },
      { key: 'metal', header: 'Metal', required: true, type: METALS },
      { key: 'loose', header: 'Loose', type: ['yes', 'no'], note: 'yes for mani and anything else sold by weight without a label.' },
      { key: 'piecesPerGram', header: 'Pieces per gram', type: 'int', note: 'Loose types only: 6 for 1x6.' },
    ],
  },
  {
    name: 'Stock pieces',
    about: 'Every labelled piece in the shop, one row each, from a count of the trays. Pieces out on approval are included.',
    rows: 6000,
    columns: [
      { key: 'type', header: 'Item type', required: true, type: 'text' },
      { key: 'metal', header: 'Metal', required: true, type: METALS },
      { key: 'label', header: 'Label', required: true, type: 'int', note: 'The number on the tag. It cannot repeat within one item type.' },
      { key: 'gross', header: 'Gross weight', required: true, type: 'num', note: 'Grams.' },
      { key: 'net', header: 'Net weight', type: 'num', note: 'Grams. Empty means the same as gross.' },
      { key: 'melting', header: 'Melting', required: true, type: 'num', note: 'Purity in percent: 91.6 for 22 carat.' },
      { key: 'huid', header: 'HUID', type: 'text' },
      { key: 'cost', header: 'Cost', type: 'num', note: 'What the piece cost, in rupees, if known.' },
      day(),
      { key: 'approval', header: 'On approval with', type: 'text', note: 'Name of whoever has the piece, if it is out on approval.' },
    ],
  },
  {
    name: 'Loose stock',
    about: 'Mani and other loose metal: one row for each type and melting, with the weight on the scale.',
    columns: [
      { key: 'type', header: 'Item type', required: true, type: 'text' },
      { key: 'metal', header: 'Metal', required: true, type: METALS },
      { key: 'melting', header: 'Melting', required: true, type: 'num', note: 'Purity in percent.' },
      { key: 'weight', header: 'Weight', required: true, type: 'num', note: 'Grams.' },
    ],
  },
  {
    name: 'Misc stock',
    about: 'Boxes, gemstones and other things counted in pieces: what is in hand.',
    columns: [
      { key: 'category', header: 'Category', required: true, type: 'text' },
      { key: 'item', header: 'Item', required: true, type: 'text' },
      { key: 'unit', header: 'Unit', required: true, type: ['piece', 'pair', 'set', 'gram'] },
      { key: 'qty', header: 'Quantity', required: true, type: 'int' },
      { key: 'unitPrice', header: 'Unit price', type: 'num', note: 'What one cost, in rupees, if known.' },
    ],
  },
  {
    name: 'Cash',
    about: 'Cash in the drawer and money in the bank account at the close of the day before the app starts. One row each.',
    columns: [
      { key: 'location', header: 'Where', required: true, type: ['vault', 'account'], note: 'vault is the shop cash, account is the bank.' },
      { key: 'amt', header: 'Amount', required: true, type: 'num' },
    ],
  },
  {
    name: 'Fine metal',
    about: 'Fine bullion in hand, one row for each metal and standard.',
    columns: [
      { key: 'metal', header: 'Metal', required: true, type: METALS },
      { key: 'standard', header: 'Standard', required: true, type: ['995', '999'] },
      { key: 'weight', header: 'Weight', required: true, type: 'num', note: 'Grams.' },
    ],
  },
  {
    name: 'Langdi',
    about: 'Melted old metal in hand, one row for each lump or lot.',
    columns: [
      { key: 'metal', header: 'Metal', required: true, type: METALS },
      { key: 'weight', header: 'Weight', required: true, type: 'num', note: 'Grams.' },
      { key: 'purity', header: 'Purity', type: 'num', note: 'Estimated purity in percent, if known.' },
      { key: 'pieces', header: 'Pieces', type: 'int' },
    ],
  },
  {
    name: 'Old metal',
    about: 'Old ornaments bought from customers that are still in the vault, not yet melted or polished for sale.',
    columns: [
      { key: 'party', header: 'Customer', type: 'text', note: 'Whom it was bought from, if known.' },
      day(),
      { key: 'metal', header: 'Metal', required: true, type: ['Gold', 'Silver', 'Phuli'] },
      { key: 'weight', header: 'Weight', required: true, type: 'num', note: 'Grams.' },
      { key: 'melting', header: 'Melting', required: true, type: 'num', note: 'Purity in percent.' },
      { key: 'amt', header: 'Value', type: 'num', note: 'What was paid for it, in rupees.' },
    ],
  },
  {
    name: 'Gold loans',
    about: 'Girvi that is still open. Leave out loans already closed. The date is the day the loan was given: interest is counted from it.',
    columns: [
      { key: 'ref', header: 'Book no', required: true, type: 'text', note: 'The number in the girvi book. Payments on the next sheet use it.' },
      ...party('Customer'),
      { key: 'item', header: 'Pledged', required: true, type: 'text', note: 'What is pledged.' },
      { key: 'weight', header: 'Weight', required: true, type: 'num', note: 'Grams.' },
      day('Date given', true),
      { key: 'amt', header: 'Amount', required: true, type: 'num', note: 'The loan as first given, in rupees.' },
      { key: 'interest', header: 'Interest', required: true, type: 'num', note: 'Percent per month.' },
      { key: 'note', header: 'Note', type: 'text' },
    ],
  },
  {
    name: 'Gold loan payments',
    about: 'Everything already received on the loans of the sheet before: each payment of interest or principal, with its day.',
    columns: [
      { key: 'ref', header: 'Book no', required: true, type: 'text' },
      day('Date', true),
      { key: 'type', header: 'Towards', required: true, type: ['interest', 'principal'] },
      { key: 'amt', header: 'Amount', required: true, type: 'num' },
    ],
  },
  {
    name: 'Udhari',
    about: 'Money owed to the shop: unpaid parts of old sale bills and plain loans given. One row for each person, with what is still to come.',
    columns: [
      ...party(),
      day(),
      { key: 'amt', header: 'Amount', required: true, type: 'num', note: 'What is still owed, in rupees.' },
    ],
  },
  {
    name: 'Borrowed',
    about: 'Money the shop has borrowed and not yet repaid. One row for each lender.',
    columns: [
      ...party(),
      day(),
      { key: 'amt', header: 'Amount', required: true, type: 'num', note: 'What the shop still owes, in rupees.' },
    ],
  },
  {
    name: 'Supplier bills',
    about: 'What the shop still owes its suppliers. One row for each unpaid bill, or one for each supplier and metal. Give the due in rupees or in fine; the rate turns one into the other.',
    columns: [
      { key: 'party', header: 'Supplier', required: true, type: 'text' },
      day('Bill date'),
      { key: 'metal', header: 'Metal', required: true, type: METALS },
      { key: 'standard', header: 'Standard', required: true, type: ['995', '999', '100'] },
      { key: 'rate', header: 'Rate', required: true, type: 'num', note: 'Rupees for a gram of fine, as fixed on the bill.' },
      { key: 'amt', header: 'Due amount', type: 'num', note: 'Rupees still owed. Fill this or the next column.' },
      { key: 'fine', header: 'Due fine', type: 'num', note: 'Grams of fine still owed.' },
      { key: 'dueDate', header: 'Pay by', type: 'date', future: true, note: 'The day the credit runs out, if one was agreed.' },
    ],
  },
  {
    name: 'Orders',
    about: 'Orders taken and not yet delivered.',
    columns: [
      ...party('Customer'),
      day('Order date', true),
      { key: 'name', header: 'Item', required: true, type: 'text', note: 'What was ordered.' },
      { key: 'metal', header: 'Metal', required: true, type: METALS },
      { key: 'weight', header: 'Weight', type: 'num', note: 'Grams.' },
      { key: 'melting', header: 'Melting', type: 'num', note: 'Purity in percent.' },
      { key: 'status', header: 'Status', type: ['order taken', 'being made', 'at shop'], note: 'Empty means order taken.' },
      { key: 'bookedRate', header: 'Booked rate', type: 'num', note: 'Rupees for a gram of fine, if the rate was fixed.' },
      { key: 'amt', header: 'Estimate', type: 'num', note: 'Rupees.' },
      { key: 'advance', header: 'Advance', type: 'num', note: 'Rupees already taken.' },
    ],
  },
  {
    name: 'BC',
    about: 'BCs not yet used up: one row each, with everything the customer has paid into it so far. A BC whose term is over but which has not been used goes here too; mature it in the app after the start.',
    columns: [
      { key: 'cardNo', header: 'Card no', type: 'text', note: 'The number on the customer's card or in the BC book.' },
      ...party('Customer'),
      day('Started', true),
      { key: 'instalment', header: 'Each month', required: true, type: 'num', note: 'Rupees.' },
      { key: 'months', header: 'Months', type: 'int', note: 'Empty means 12.' },
      { key: 'multiplier', header: 'Worth', type: 'num', note: 'What a fully paid BC is worth, in instalments. Empty means 13.5.' },
      { key: 'paid', header: 'Paid so far', required: true, type: 'num', note: 'Rupees, all instalments together.' },
    ],
  },
  {
    name: 'Repairs',
    about: 'Customers\' pieces that are in the shop or with a karigar for repair.',
    columns: [
      ...party('Customer'),
      { key: 'desc', header: 'Item and repair', required: true, type: 'text' },
      day('Received', true),
      { key: 'weight', header: 'Weight', required: true, type: 'num', note: 'Grams, as received.' },
      { key: 'status', header: 'Status', type: ['taken', 'sent for repair', 'repaired'], note: 'Empty means taken.' },
      { key: 'karigar', header: 'Karigar', type: 'text', note: 'Who has it, if it was sent out.' },
      { key: 'amt', header: 'Charge', type: 'num', note: 'Rupees.' },
      { key: 'paid', header: 'Paid', type: 'num', note: 'Rupees already taken.' },
    ],
  },
];

export const DEFAULT_FILE = 'opening/opening-data.xlsx';

// A header as it is matched: letters and digits only, so spacing and capitals do not matter.
export const plain = (header) => String(header ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
