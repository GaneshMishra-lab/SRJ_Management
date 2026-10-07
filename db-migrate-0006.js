// Applies drizzle/0006_daybook.sql in one transaction.
//   node --env-file=.env.local db-migrate-0006.js            dry run, rolled back
//   node --env-file=.env.local db-migrate-0006.js --apply    commit
// Adds the day book's four tables (daybook_head, daybook_rule, daybook_entry, daybook_settings)
// and fills in the heads of the handwritten book, where each kind of app entry is written, and
// the invocation lines. No existing table is changed. --apply also records 0006 in drizzle's
// migration history, so `drizzle-kit migrate` stays in step.
import { Pool } from '@neondatabase/serverless';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const TAG = '0006_daybook';
const KINDS = 26; // lib/daybook/kinds.ts
const apply = process.argv.includes('--apply');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();

try {
  await client.query('BEGIN');

  const { rows: ledgerBefore } = await client.query('SELECT count(*)::int AS n FROM cash_ledger');

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

  const { rows: heads } = await client.query(
    `SELECT side, page, count(*)::int AS heads, count(role)::int AS with_role FROM daybook_head GROUP BY side, page ORDER BY side, page`,
  );
  const { rows: rules } = await client.query('SELECT count(*)::int AS n FROM daybook_rule');
  const { rows: settings } = await client.query('SELECT id, show_invocation, length(invocation) AS chars FROM daybook_settings');
  const { rows: ledgerAfter } = await client.query('SELECT count(*)::int AS n FROM cash_ledger');
  const { rows: recorded } = await client.query('SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations');

  console.table(heads);
  console.log(`daybook_rule: ${rules[0].n} of ${KINDS} kinds have a head`);
  console.log('daybook_settings:', settings[0]);
  console.log(`cash_ledger rows: ${ledgerBefore[0].n} before, ${ledgerAfter[0].n} after`);
  console.log(`migrations recorded: ${recorded[0].n} (journal lists ${journal.length})`);
  if (rules[0].n !== KINDS) throw new Error('Some kinds found no head: check the names in the seed.');

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
