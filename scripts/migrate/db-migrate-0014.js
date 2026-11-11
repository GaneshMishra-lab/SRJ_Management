// Applies drizzle/0014_loose_lots.sql in one transaction.
//   node --env-file=.env.local scripts/migrate/db-migrate-0014.js            dry run, rolled back
//   node --env-file=.env.local scripts/migrate/db-migrate-0014.js --apply    commit
// Loose lots keep their purchase terms and a piece count: wastage, making (per gram) and pieces on
// loose_stock_ledger, the same on a loose sale line (so a cancelled bill puts them back in the same
// lot), and item_type.counted for types kept by count as well as weight (phuli, nath). New columns
// only, nullable or with a default of 0 / false; no existing value is changed.
// --apply also records 0014 in drizzle's migration history, so `drizzle-kit migrate` stays in step.
import { Pool } from '@neondatabase/serverless';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const TAG = '0014_loose_lots';
const apply = process.argv.includes('--apply');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();

const counts = async () => (await client.query(
  `SELECT (SELECT count(*)::int FROM loose_stock_ledger) AS loose_rows,
          (SELECT coalesce(sum(weight), 0)::float FROM loose_stock_ledger) AS loose_weight,
          (SELECT count(*)::int FROM item_sale) AS sale_lines,
          (SELECT count(*)::int FROM audit_log) AS audit_rows`,
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
  const { rows: checks } = await client.query("SELECT count(*)::int AS new_columns FROM information_schema.columns WHERE (table_name, column_name) IN (('loose_stock_ledger', 'wastage'), ('loose_stock_ledger', 'making'), ('loose_stock_ledger', 'pieces'), ('item_sale', 'lot_wastage'), ('item_sale', 'lot_making'), ('item_sale', 'pieces'), ('item_type', 'counted'))");
  const { rows: recorded } = await client.query('SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations');

  console.log('before:', before);
  console.log('after: ', after);
  console.log('new columns (want 7):', checks[0]);
  console.log(`migrations recorded: ${recorded[0].n} (journal lists ${journal.length})`);
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('Existing rows changed: they must not.');

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
