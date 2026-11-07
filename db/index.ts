import { Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import * as schema from './schema';

const url = process.env.DATABASE_URL!;
const pool = new Pool({ connectionString: url });
export const db = drizzle(pool, { schema });

// Which database this connection is on: the test branch when DATABASE_URL is the one kept as
// DATABASE_URL_TEST (switched with `npm run db:test` / `npm run db:prod`), otherwise production.
// Worked out from the same URL the pool opened, so the app's warning can never disagree with it.
export const dbTarget: 'test' | 'prod' = process.env.DATABASE_URL_TEST && url === process.env.DATABASE_URL_TEST ? 'test' : 'prod';
