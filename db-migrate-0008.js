// Applies drizzle/0008_loose_stock.sql in one transaction.
//   node --env-file=.env.local db-migrate-0008.js            dry run, rolled back
//   node --env-file=.env.local db-migrate-0008.js --apply    commit
// Adds loose metal (mani) kept by weight: item_type.loose and pieces_per_gram, the new
// loose_stock_ledger table, and item_type / weight / melting on item_sale for a loose line on a
// sale bill. Only new columns and a new table; no row already recorded is changed. --apply also
// records 0008 in drizzle's migration history, so `drizzle-kit migrate` stays in step.
import { Pool } from '@neondatabase/serverless';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const TAG = '0008_loose_stock';
const apply = process.argv.includes('--apply');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();

const counts = async () => (await client.query(
  `SELECT (SELECT count(*)::int FROM item_type) AS item_types,
          (SELECT count(*)::int FROM item_sale) AS sale_lines,
          (SELECT coalesce(sum(amt), 0) FROM item_sale) AS sale_total,
          (SELECT count(*)::int FROM item_stock) AS pieces`,
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
  const { rows: types } = await client.query('SELECT count(*) FILTER (WHERE loose)::int AS loose_types FROM item_type');
  const { rows: lines } = await client.query('SELECT count(*) FILTER (WHERE item_type IS NOT NULL)::int AS loose_lines FROM item_sale');
  const { rows: ledger } = await client.query('SELECT count(*)::int AS n FROM loose_stock_ledger');
  const { rows: recorded } = await client.query('SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations');

  console.log('before:', before);
  console.log('after: ', after);
  console.log(`loose types: ${types[0].loose_types}, loose sale lines: ${lines[0].loose_lines}, loose_stock_ledger rows: ${ledger[0].n}`);
  console.log(`migrations recorded: ${recorded[0].n} (journal lists ${journal.length})`);
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('Existing rows changed: they must not.');
  if (types[0].loose_types !== 0 || lines[0].loose_lines !== 0 || ledger[0].n !== 0) throw new Error('Loose stock must start empty.');

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
