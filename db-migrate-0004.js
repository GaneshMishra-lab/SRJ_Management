// Applies drizzle/0004_sale_cancellation.sql in one transaction.
//   node --env-file=.env.local db-migrate-0004.js            dry run, rolled back
//   node --env-file=.env.local db-migrate-0004.js --apply    commit
// Adds cancelled_at and cancel_reason to item_sale_bill and rebuilds entity_balance so that
// cancelled bills are not counted as dues. --apply also records 0004 in drizzle's migration
// history, so `drizzle-kit migrate` stays in step.
import { Pool } from '@neondatabase/serverless';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const TAG = '0004_sale_cancellation';
const apply = process.argv.includes('--apply');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();

try {
  await client.query('BEGIN');

  const { rows: before } = await client.query('SELECT count(*)::int AS n, coalesce(sum(sale_due), 0) AS sale_due FROM entity_balance');

  const file = readFileSync(`drizzle/${TAG}.sql`);
  for (const statement of file.toString('utf8').split('--> statement-breakpoint')) {
    await client.query(statement);
  }

  const entry = JSON.parse(readFileSync('drizzle/meta/_journal.json', 'utf8')).entries.find((e) => e.tag === TAG);
  const hash = createHash('sha256').update(file).digest('hex');
  const { rows: done } = await client.query('SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = $1', [hash]);
  if (done.length === 0) {
    await client.query('INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)', [hash, entry.when]);
  }

  const { rows: after } = await client.query('SELECT count(*)::int AS n, coalesce(sum(sale_due), 0) AS sale_due FROM entity_balance');
  const { rows: bills } = await client.query('SELECT count(*)::int AS n, count(cancelled_at)::int AS cancelled FROM item_sale_bill');
  console.log('entity_balance before:', before[0]);
  console.log('entity_balance after: ', after[0]);
  console.log('item_sale_bill:', bills[0]);

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
