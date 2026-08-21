/**
 * Idempotent schema migrations. Safe to run repeatedly:
 *   node scripts/migrate.mjs
 *
 * Anything added here must also be reflected in schema.sql so a fresh database
 * created from that file matches a migrated one.
 */
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sql = neon(process.env.DATABASE_URL);

const steps = [
  // The RM dashboard needs sla_deadline to mean "when this is due" so it can
  // run a countdown against it. Skipping an action used to overwrite that
  // deadline; snoozed_until keeps the two apart.
  [
    "actions.snoozed_until",
    async () => sql`ALTER TABLE actions ADD COLUMN IF NOT EXISTS snoozed_until TIMESTAMPTZ`,
  ],
  [
    "actions queue index",
    async () => sql`
      CREATE INDEX IF NOT EXISTS actions_rm_status_deadline_idx
      ON actions (rm_id, status, sla_deadline)`,
  ],
  [
    "notifications unread index",
    async () => sql`
      CREATE INDEX IF NOT EXISTS notifications_user_unread_idx
      ON notifications (user_id, read_at, created_at DESC)`,
  ],
];

for (const [label, run] of steps) {
  await run();
  console.log(`✓ ${label}`);
}
console.log("Migrations complete.");
