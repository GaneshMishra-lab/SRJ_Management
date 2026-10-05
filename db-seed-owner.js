// Creates the owner login (there is no sign-up page).
//   node --env-file=.env.local db-seed-owner.js <username> <password> "<name>"
import { neon } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';

const [username, password, name = 'Owner'] = process.argv.slice(2);

if (!username || !password || password.length < 8) {
  console.error('Usage: node --env-file=.env.local db-seed-owner.js <username> <password (8+ chars)> "<name>"');
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

async function main() {
  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const res = await sql`
      INSERT INTO "users" ("name", "username", "password_hash", "role")
      VALUES (${name}, ${username.trim().toLowerCase()}, ${passwordHash}, 'owner')
      ON CONFLICT ("username") DO NOTHING
      RETURNING "id", "username";
    `;
    console.log(res.length ? `Owner login created: ${res[0].username}` : 'That username already exists; nothing changed.');
  } catch (err) {
    console.error('Error:', err);
  }
}

main();
