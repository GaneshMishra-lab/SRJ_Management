// Applies drizzle/0003_spec_alignment.sql in one transaction.
//   node --env-file=.env.local db-migrate-0003.js            dry run, rolled back
//   node --env-file=.env.local db-migrate-0003.js --apply    commit
// The live database was built with `drizzle-kit push`, so drizzle's migration
// history is empty; --apply also records 0000-0003 as applied so that
// `drizzle-kit migrate` works from here on.
import { Pool } from '@neondatabase/serverless';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const apply = process.argv.includes('--apply');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();

try {
  await client.query('BEGIN');

  const statements = readFileSync('drizzle/0003_spec_alignment.sql', 'utf8').split('--> statement-breakpoint');
  for (const statement of statements) {
    await client.query(statement);
  }

  const journal = JSON.parse(readFileSync('drizzle/meta/_journal.json', 'utf8'));
  const { rows: done } = await client.query('SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations');
  if (done[0].n === 0) {
    for (const entry of journal.entries) {
      const hash = createHash('sha256').update(readFileSync(`drizzle/${entry.tag}.sql`)).digest('hex');
      await client.query('INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)', [hash, entry.when]);
    }
  }

  const { rows: tables } = await client.query(
    "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'",
  );
  const { rows: stock } = await client.query(
    'SELECT s.label, t.name AS item_type, t.next_label, s.metal, s.gross_weight, s.net_weight, s.melting FROM item_stock s LEFT JOIN item_type t ON t.id = s.item_type',
  );
  const { rows: bills } = await client.query('SELECT metal, standard, rate, bill_amt, fine, paid_amt FROM bill');
  const { rows: balance } = await client.query('SELECT * FROM entity_balance');
  console.log('tables and views:', tables[0].n);
  console.log('item_stock:', stock);
  console.log('bill:', bills);
  console.log('entity_balance:', balance);

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
