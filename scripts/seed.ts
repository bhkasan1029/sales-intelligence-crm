import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  const pwHash = await bcrypt.hash("demo123", 10);

  const [admin] = await sql`
    INSERT INTO users (name, email, password_hash, role)
    VALUES ('Admin User', 'admin@demo.com', ${pwHash}, 'admin') RETURNING id`;
  const [rh] = await sql`
    INSERT INTO users (name, email, password_hash, role)
    VALUES ('Vikram Rathi', 'rh@demo.com', ${pwHash}, 'regional_head') RETURNING id`;
  const [bm1] = await sql`
    INSERT INTO users (name, email, password_hash, role, manager_id)
    VALUES ('Deepak Verma', 'bm1@demo.com', ${pwHash}, 'branch_manager', ${rh.id}) RETURNING id`;
  const [bm2] = await sql`
    INSERT INTO users (name, email, password_hash, role, manager_id)
    VALUES ('Anita Rao', 'bm2@demo.com', ${pwHash}, 'branch_manager', ${rh.id}) RETURNING id`;
  const [rm1] = await sql`
    INSERT INTO users (name, email, password_hash, role, manager_id)
    VALUES ('Neha Kulkarni', 'rm1@demo.com', ${pwHash}, 'rm', ${bm1.id}) RETURNING id`;
  const [rm2] = await sql`
    INSERT INTO users (name, email, password_hash, role, manager_id)
    VALUES ('Arjun Singh', 'rm2@demo.com', ${pwHash}, 'rm', ${bm1.id}) RETURNING id`;
  const [rm3] = await sql`
    INSERT INTO users (name, email, password_hash, role, manager_id)
    VALUES ('Ritu Das', 'rm3@demo.com', ${pwHash}, 'rm', ${bm2.id}) RETURNING id`;

  // action_type values MUST match the keys in rules-engine.ts REGISTRY (lowercase snake_case).
  // The engine dispatches by action_type, so a rule row with an unknown value gets skipped.
  const rules = [
    ["Follow-up Breach", "RM has not contacted a new/in-progress lead within SLA", { sla_hours: 24, response_hours: 4 }, "follow_up_breach", 1],
    ["Opportunity at Risk", "Pay-in received with no follow-up within window", { followup_window_days: 3, response_hours: 24 }, "opportunity_at_risk", 1.2],
    ["Target Gap", "RM tracking meaningfully behind expected run-rate", { gap_threshold_pct: 15 }, "target_gap", 1],
    ["Special Achievement", "RM crossed 120% of target", { achievement_pct: 120 }, "target_achievement", 0.5],
    ["Escalated Breach", "Breach still open past escalation window → notify manager", { escalation_hours: 48, watch_action_types: ["follow_up_breach", "opportunity_at_risk"] }, "escalated_breach", 1],
    ["Stale Pipeline", "Open lead with no contact for N days", { stale_days: 14, min_value: 100000 }, "stale_pipeline", 0.8],
    ["Meeting No Outcome", "Meeting logged but outcome/next-step missing", { grace_hours: 24 }, "meeting_no_outcome", 0.7],
    ["Major Win", "Large pay-in or conversion event", { min_amount: 1000000 }, "major_win", 0.5],
  ] as const;
  const ruleIds: Record<string, string> = {};
  for (const [name, description, condition, action_type, weight] of rules) {
    const [row] = await sql`
      INSERT INTO rules (name, description, condition, action_type, weight, updated_by)
      VALUES (${name}, ${description}, ${JSON.stringify(condition)}, ${action_type}, ${weight}, ${admin.id})
      RETURNING id`;
    ruleIds[action_type] = row.id;
  }

  const [cust1] = await sql`
    INSERT INTO customers (name, rm_id, segment, stage, potential_value, lead_source, mobile, email, assigned_at)
    VALUES ('Meridian Textiles Pvt Ltd', ${rm1.id}, 'HNI', 'new', 850000, 'referral', '9876543210', 'contact@meridiantex.com', now() - interval '30 hours')
    RETURNING id`;

  const [cust2] = await sql`
    INSERT INTO customers (name, rm_id, segment, stage, potential_value, lead_source, mobile, email, assigned_at, last_contact_at)
    VALUES ('Priya Enterprises', ${rm1.id}, 'retail', 'active', 300000, 'campaign', '9812345678', 'priya@enterprises.in', now() - interval '20 days', now() - interval '10 days')
    RETURNING id`;
  await sql`
    INSERT INTO events (type, customer_id, rm_id, payload, created_at)
    VALUES ('PAYIN_RECEIVED', ${cust2.id}, ${rm1.id}, ${JSON.stringify({ amount: 150000 })}, now() - interval '4 days')`;

  const [cust3] = await sql`
    INSERT INTO customers (name, rm_id, segment, stage, potential_value, lead_source, mobile, email, assigned_at, last_contact_at)
    VALUES ('Karan Oberoi', ${rm2.id}, 'retail', 'in_progress', 120000, 'walk-in', '9900112233', 'karan.o@mail.com', now() - interval '10 hours', now() - interval '2 hours')
    RETURNING id`;
  await sql`
    INSERT INTO events (type, customer_id, rm_id, payload, created_at)
    VALUES ('MEETING_COMPLETED', ${cust3.id}, ${rm2.id}, '{}', now() - interval '2 hours')`;

  await sql`
    INSERT INTO customers (name, rm_id, segment, stage, potential_value, lead_source, mobile, email, assigned_at, last_contact_at)
    VALUES ('Suresh Traders', ${rm3.id}, 'retail', 'active', 200000, 'referral', '9765432109', 'suresh@traders.in', now() - interval '15 days', now() - interval '1 day')`;

  await sql`INSERT INTO targets (owner_id, owner_role, period, target_value, achieved_value, set_by) VALUES (${rm1.id}, 'rm', '2026-08', 1000000, 350000, ${bm1.id})`;
  await sql`INSERT INTO targets (owner_id, owner_role, period, target_value, achieved_value, set_by) VALUES (${rm2.id}, 'rm', '2026-08', 800000, 980000, ${bm1.id})`;
  await sql`INSERT INTO targets (owner_id, owner_role, period, target_value, achieved_value, set_by) VALUES (${rm3.id}, 'rm', '2026-08', 900000, 850000, ${bm2.id})`;

  await sql`INSERT INTO targets (owner_id, owner_role, period, target_value, set_by) VALUES (${bm1.id}, 'branch_manager', '2026-08', 1800000, ${rh.id})`;
  await sql`INSERT INTO targets (owner_id, owner_role, period, target_value, set_by) VALUES (${bm2.id}, 'branch_manager', '2026-08', 900000, ${rh.id})`;

  await sql`
    INSERT INTO feedback (author_id, category, related_rule_id, subject, body)
    VALUES (${rm1.id}, 'rule_dispute', ${ruleIds["follow_up_breach"]}, '24h SLA too tight for HNI leads',
      'Meridian Textiles needed a compliance check before first contact — 24h was not realistic for this segment.')`;
  await sql`
    INSERT INTO rule_change_requests (rule_id, requested_by, proposed_condition, justification)
    VALUES (${ruleIds["follow_up_breach"]}, ${rh.id}, ${JSON.stringify({ sla_hours: 30, escalation_hours: 48 })},
      'HNI-segment leads consistently need more lead time before first contact across both branches this quarter.')`;

  // Seed a few open actions with the SAME action_type as the engine's REGISTRY keys.
  // This matters because `dedupeKey` uses source_rule_id (fine here) OR falls back to type,
  // and the Tasks-page filters read `type` for display grouping.
  await sql`
    INSERT INTO actions (customer_id, rm_id, type, message, reason, priority_score, source_rule_id)
    VALUES (${cust1.id}, ${rm1.id}, 'follow_up_breach',
      '30h since assignment, no contact yet',
      'SLA of 24h breached (configured threshold)',
      82, ${ruleIds["follow_up_breach"]})`;
  await sql`
    INSERT INTO actions (customer_id, rm_id, type, message, reason, priority_score, source_rule_id)
    VALUES (${cust2.id}, ${rm1.id}, 'opportunity_at_risk',
      '₹1,50,000 pay-in, no follow-up since',
      'No contact within the configured 3-day follow-up window',
      74, ${ruleIds["opportunity_at_risk"]})`;
  await sql`
    INSERT INTO actions (rm_id, type, message, reason, priority_score, source_rule_id)
    VALUES (${rm1.id}, 'target_gap',
      'At 35% of target vs 65% expected',
      'Gap of 30 points exceeds the configured 15-point threshold',
      68, ${ruleIds["target_gap"]})`;
  await sql`
    INSERT INTO actions (customer_id, rm_id, type, message, reason, priority_score, source_rule_id)
    VALUES (${cust3.id}, ${rm2.id}, 'follow_up_breach',
      '10h since meeting, needs summary',
      'Meeting completed 2h ago, summary pending',
      45, ${ruleIds["follow_up_breach"]})`;
  await sql`
    INSERT INTO actions (rm_id, type, message, reason, priority_score, source_rule_id)
    VALUES (${rm2.id}, 'target_achievement',
      'Crossed 122% of target',
      'Achievement at/above the configured 120% milestone',
      30, ${ruleIds["target_achievement"]})`;

  console.log("Seed complete.");
  console.log("Admin:          admin@demo.com / demo123");
  console.log("Regional Head:  rh@demo.com / demo123");
  console.log("Branch Mgr 1:   bm1@demo.com / demo123 (owns rm1, rm2)");
  console.log("Branch Mgr 2:   bm2@demo.com / demo123 (owns rm3)");
  console.log("RM1 (behind):   rm1@demo.com / demo123");
  console.log("RM2 (achiever): rm2@demo.com / demo123");
  console.log("RM3 (healthy):  rm3@demo.com / demo123");
}

main().catch((e) => { console.error(e); process.exit(1); });
