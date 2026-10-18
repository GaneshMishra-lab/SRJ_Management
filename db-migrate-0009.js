// Applies drizzle/0009_bc_scheme.sql in one transaction.
//   node --env-file=.env.local db-migrate-0009.js            dry run, rolled back
//   node --env-file=.env.local db-migrate-0009.js --apply    commit
// Adds the BC savings scheme: the new bc and bc_payment tables, and a bc column on
// item_sale_details for a BC spent on a sale bill. Only new tables and a new column; no row
// already recorded is changed. --apply also records 0009 in drizzle's migration history, so
// `drizzle-kit migrate` stays in step.
import { Pool } from '@neondatabase/serverless';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const TAG = '0009_bc_scheme';
const apply = process.argv.includes('--apply');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();

const counts = async () => (await client.query(
  `SELECT (SELECT count(*)::int FROM item_sale_details) AS sale_payments,
          (SELECT coalesce(sum(amt_paid), 0) FROM item_sale_details) AS sale_paid,
          (SELECT count(*)::int FROM cash_ledger) AS cash_entries,
          (SELECT coalesce(sum(amt), 0) FROM cash_ledger) AS cash_total`,
)).rows[0];

try {
  await client.query('BEGIN');

  const before = await counts();

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
  const { rows: bcs } = await client.query('SELECT (SELECT count(*)::int FROM bc) AS bcs, (SELECT count(*)::int FROM bc_payment) AS payments');
  const { rows: spent } = await client.query('SELECT count(*)::int AS n FROM item_sale_details WHERE bc IS NOT NULL');
  const { rows: recorded } = await client.query('SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations');

  console.log('before:', before);
  console.log('after: ', after);
  console.log(`bc rows: ${bcs[0].bcs}, bc_payment rows: ${bcs[0].payments}, sale payments from a BC: ${spent[0].n}`);
  console.log(`migrations recorded: ${recorded[0].n} (journal lists ${journal.length})`);
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('Existing rows changed: they must not.');
  if (bcs[0].bcs !== 0 || bcs[0].payments !== 0 || spent[0].n !== 0) throw new Error('BC tables must start empty.');

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
