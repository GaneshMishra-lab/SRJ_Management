// Applies drizzle/0012_lend_note.sql in one transaction.
//   node --env-file=.env.local db-migrate-0012.js            dry run, rolled back
//   node --env-file=.env.local db-migrate-0012.js --apply    commit
// Adds an optional note to each सावकारी (lend) entry, e.g. "to be used with BC no. 14". One new
// nullable column; no existing row is changed.
// --apply also records 0012 in drizzle's migration history, so `drizzle-kit migrate` stays in step.
import { Pool } from '@neondatabase/serverless';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const TAG = '0012_lend_note';
const apply = process.argv.includes('--apply');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();

const counts = async () => (await client.query(
  `SELECT (SELECT count(*)::int FROM lend_entry) AS lend_entries,
          (SELECT coalesce(sum(amt), 0)::float FROM lend_entry) AS lend_total,
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
  const { rows: checks } = await client.query("SELECT count(*)::int AS note_column FROM information_schema.columns WHERE table_name = 'lend_entry' AND column_name = 'note'");
  const { rows: recorded } = await client.query('SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations');

  console.log('before:', before);
  console.log('after: ', after);
  console.log('new column:', checks[0]);
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
