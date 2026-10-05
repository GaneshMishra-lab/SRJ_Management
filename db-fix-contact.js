import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

async function main() {
  try {
    console.log("Altering entity contact column to text...");
    await sql`
      ALTER TABLE "entity" ALTER COLUMN "contact" TYPE text USING contact::text;
    `;
    console.log("Done!");
  } catch (err) {
    console.error("Error:", err);
  }
}

main();
