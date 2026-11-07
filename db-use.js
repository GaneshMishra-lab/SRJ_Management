// Switches the app, the db-*.js scripts and drizzle between the production database and the
// test branch, by pointing DATABASE_URL in .env.local at one of the two kept beside it:
//   DATABASE_URL_PROD   the shop's real books
//   DATABASE_URL_TEST   the Neon branch "test", a copy to try things on
//
//   npm run db:which    which one is in use
//   npm run db:test     use the test branch
//   npm run db:prod     use production
//
// Only the DATABASE_URL line is rewritten; connection strings are never printed.
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = '.env.local';
const target = process.argv[2];
if (target && target !== 'test' && target !== 'prod') {
  console.error('Usage: node db-use.js [test|prod]');
  process.exit(1);
}

const text = readFileSync(FILE, 'utf8');
const eol = text.includes('\r\n') ? '\r\n' : '\n';
const lines = text.split(/\r?\n/);
const valueOf = (key) => {
  const line = lines.find((l) => l.startsWith(`${key}=`));
  return line === undefined ? undefined : line.slice(key.length + 1);
};
const current = valueOf('DATABASE_URL');
const prod = valueOf('DATABASE_URL_PROD');
const test = valueOf('DATABASE_URL_TEST');
const nameOf = (url) => (url && url === test ? 'test' : url && url === prod ? 'prod' : 'neither (DATABASE_URL matches no saved one)');

if (!target) {
  console.log(`In use: ${nameOf(current)}`);
  process.exit(0);
}

const url = target === 'test' ? test : prod;
if (!url) {
  console.error(`${FILE} has no DATABASE_URL_${target.toUpperCase()}. Add it, then run this again.`);
  process.exit(1);
}
if (url === current) {
  console.log(`Already on ${target}.`);
  process.exit(0);
}
// A DATABASE_URL that is neither saved one would be lost by switching; keep it rather than guess.
if (current && current !== prod && current !== test) {
  console.error(`DATABASE_URL in ${FILE} matches neither DATABASE_URL_PROD nor DATABASE_URL_TEST. Save it as one of them first.`);
  process.exit(1);
}

const at = lines.findIndex((l) => l.startsWith('DATABASE_URL='));
if (at >= 0) lines[at] = `DATABASE_URL=${url}`;
else lines.unshift(`DATABASE_URL=${url}`);
writeFileSync(FILE, lines.join(eol));
console.log(`Now on ${target}. Restart \`npm run dev\` so the app connects to it.`);
