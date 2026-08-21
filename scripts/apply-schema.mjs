/**
 * Create the schema from schema.sql on an empty database:
 *   node scripts/apply-schema.mjs
 *
 * Statements are CREATE TABLE / CREATE EXTENSION only, so this is additive —
 * it will fail loudly rather than drop anything if the tables already exist.
 */
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sql = neon(process.env.DATABASE_URL);

const statements = readFileSync("schema.sql", "utf8")
  .split(/;\s*\n/)
  .map((s) => s.replace(/^\s*--.*$/gm, "").trim())
  .filter(Boolean);

for (const statement of statements) {
  await sql.query(statement);
  const name = statement.match(/CREATE (?:TABLE|EXTENSION IF NOT EXISTS)\s+(?:IF NOT EXISTS\s+)?(\w+)/i);
  console.log(`✓ ${name?.[1] ?? statement.slice(0, 40)}`);
}
console.log(`Applied ${statements.length} statements.`);
