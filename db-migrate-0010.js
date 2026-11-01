// Applies drizzle/0010_lend_on_sale.sql in one transaction.
//   node --env-file=.env.local db-migrate-0010.js            dry run, rolled back
//   node --env-file=.env.local db-migrate-0010.js --apply    commit
// Lets a sale bill be paid out of money the shop holds for the customer (its सावकारी / lend
// account): a sale column on lend_entry for the bill it was used on. And moves an order's advance
// under सावकारी पेठे in the day book, as the shop writes it. No money row already recorded is
// changed. --apply also records 0010 in drizzle's migration history, so `drizzle-kit migrate`
// stays in step.
import { Pool } from '@neondatabase/serverless';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const TAG = '0010_lend_on_sale';
const apply = process.argv.includes('--apply');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();

const counts = async () => (await client.query(
  `SELECT (SELECT count(*)::int FROM item_sale_details) AS sale_payments,
          (SELECT coalesce(sum(amt_paid), 0) FROM item_sale_details) AS sale_paid,
          (SELECT count(*)::int FROM lend_entry) AS lend_entries,
          (SELECT coalesce(sum(amt), 0) FROM lend_entry) AS lend_total,
          (SELECT count(*)::int FROM cash_ledger) AS cash_entries,
          (SELECT coalesce(sum(amt), 0) FROM cash_ledger) AS cash_total`,
)).rows[0];

const orderRules = async () => (await client.query(
  `SELECT r.kind, h.name_en, h.side FROM daybook_rule r JOIN daybook_head h ON h.id = r.head WHERE r.kind LIKE 'order.%' ORDER BY r.kind`,
)).rows;

try {
  await client.query('BEGIN');

  const before = await counts();
  console.log('order advances were under:', await orderRules());

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

  const after = await counts();
  const rules = await orderRules();
  const { rows: linked } = await client.query('SELECT count(*)::int AS n FROM lend_entry WHERE sale IS NOT NULL');
  const { rows: recorded } = await client.query('SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations');

  console.log('before:', before);
  console.log('after: ', after);
  console.log('order advances now under:', rules);
  console.log(`migrations recorded: ${recorded[0].n} (journal lists ${journal.length})`);
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('Existing rows changed: they must not.');
  if (linked[0].n !== 0) throw new Error('No lend entry can be tied to a bill yet.');
  if (rules.length !== 2 || rules.some((rule) => rule.name_en !== 'Savkari (Moneylending)' || rule.side !== 'credit')) {
    throw new Error('Both order kinds must now be under सावकारी पेठे.');
  }

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
