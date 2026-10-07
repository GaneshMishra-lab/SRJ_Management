// Applies drizzle/0007_credit_and_heads.sql in one transaction.
//   node --env-file=.env.local db-migrate-0007.js            dry run, rolled back
//   node --env-file=.env.local db-migrate-0007.js --apply    commit
// Adds the supplier's due date to purchase bills (bill.due_date), credit to misc purchases
// (misc_trade.paid_amt and due_date, with a new misc_trade_payment table), and moves eight kinds of
// app entry to the day book heads the shop writes them under. No money already recorded is
// changed. --apply also records 0007 in drizzle's migration history, so `drizzle-kit migrate`
// stays in step.
import { Pool } from '@neondatabase/serverless';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const TAG = '0007_credit_and_heads';
const KINDS = 27; // lib/daybook/kinds.ts
const MOVED = ['supplier.gold', 'supplier.silver', 'supplier_return.gold', 'supplier_return.silver', 'old.gold', 'old.silver', 'langdi.gold', 'langdi.silver'];
const apply = process.argv.includes('--apply');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();

try {
  await client.query('BEGIN');

  const { rows: ledgerBefore } = await client.query('SELECT count(*)::int AS n, coalesce(sum(amt), 0) AS total FROM cash_ledger');

  const file = readFileSync(`drizzle/${TAG}.sql`);
  for (const statement of file.toString('utf8').split('--> statement-breakpoint')) {
    await client.query(statement);
  }

  const journal = JSON.parse(readFileSync('drizzle/meta/_journal.json', 'utf8')).entries;
  const entry = journal.find((e) => e.tag === TAG);
  const hash = createHash('sha256').update(file).digest('hex');
  const { rows: done } = await client.query('SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = $1', [hash]);
  if (done.length === 0) {
    await client.query('INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)', [hash, entry.when]);
  }

  const { rows: placed } = await client.query(
    `SELECT r.kind, h.side, h.name_en AS head FROM daybook_rule r JOIN daybook_head h ON h.id = r.head WHERE r.kind = ANY($1) ORDER BY r.kind`,
    [MOVED],
  );
  const { rows: rules } = await client.query('SELECT count(*)::int AS n FROM daybook_rule');
  const { rows: misc } = await client.query(
    `SELECT count(*)::int AS trades, count(*) FILTER (WHERE paid_amt IS DISTINCT FROM amt)::int AS not_paid_in_full FROM misc_trade`,
  );
  const { rows: bills } = await client.query('SELECT count(*)::int AS bills, count(due_date)::int AS with_due_date FROM bill');
  const { rows: ledgerAfter } = await client.query('SELECT count(*)::int AS n, coalesce(sum(amt), 0) AS total FROM cash_ledger');
  const { rows: recorded } = await client.query('SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations');

  console.table(placed);
  console.log(`daybook_rule: ${rules[0].n} of ${KINDS} kinds have a head`);
  console.log('misc_trade:', misc[0]);
  console.log('bill:', bills[0]);
  console.log(`cash_ledger: ${ledgerBefore[0].n} rows (${ledgerBefore[0].total}) before, ${ledgerAfter[0].n} rows (${ledgerAfter[0].total}) after`);
  console.log(`migrations recorded: ${recorded[0].n} (journal lists ${journal.length})`);
  if (placed.length !== MOVED.length) throw new Error('Some kinds found no head: check the head names in the migration.');
  if (rules[0].n !== KINDS) console.warn(`Note: ${KINDS - rules[0].n} kinds have no head and will show under "Unassigned" until one is chosen in settings.`);
  if (ledgerBefore[0].n !== ledgerAfter[0].n || ledgerBefore[0].total !== ledgerAfter[0].total) throw new Error('The cash ledger changed: it must not.');

  await client.query(apply ? 'COMMIT' : 'ROLLBACK');
  console.log(apply ? 'Applied.' : 'Dry run OK, rolled back. Re-run with --apply to commit.');
} catch (err) {
  await client.query('ROLLBACK');
  console.error('Failed, rolled back:', err);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
