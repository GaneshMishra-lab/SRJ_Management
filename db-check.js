import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

async function main() {
  try {
    const res = await sql`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'item_purchased';
    `;
    console.log(res);
  } catch (err) {
    console.error(err);
  }
}
main();
