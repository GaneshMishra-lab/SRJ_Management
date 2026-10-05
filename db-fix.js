import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

async function main() {
  try {
    console.log("Creating item_type table...");
    await sql`
      CREATE TABLE IF NOT EXISTS "item_type" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        "name" text NOT NULL,
        "metal" text,
        "desc" text
      );
    `;

    console.log("Adding item_type_id column to item_purchased...");
    await sql`
      ALTER TABLE "item_purchased" ADD COLUMN IF NOT EXISTS "item_type_id" uuid REFERENCES "item_type"("id");
    `;

    console.log("Dropping name and metal from item_purchased...");
    await sql`
      ALTER TABLE "item_purchased" DROP COLUMN IF EXISTS "name";
    `;
    await sql`
      ALTER TABLE "item_purchased" DROP COLUMN IF EXISTS "metal";
    `;

    console.log("Done!");
  } catch (err) {
    console.error("Error:", err);
  }
}

main();
