/**
 * Demo seed — builds a full RH -> BM -> RM hierarchy with customers, events,
 * actions, tasks, targets, self-evaluations and feedback, so every dashboard
 * has something real to render.
 *
 *   node scripts/seed.mjs
 *   node scripts/seed.mjs --attach=you@example.com   # also make that account a BM
 *
 * Safe to re-run: it deletes only rows belonging to @demo.com users first.
 * Plain .mjs so it runs on bare node — no tsx/dotenv dependency needed.
 */
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const sql = neon(process.env.DATABASE_URL);

const attachArg = process.argv.find((a) => a.startsWith("--attach="));
const attachEmail = attachArg ? attachArg.slice("--attach=".length) : null;

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

/** Deterministic RNG so re-seeding produces the same demo every time. */
let seed = 20260820;
function rand() {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
}
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const between = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));

const now = new Date();
const PERIOD = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
const PERIOD_LABEL = now.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
const PREV_PERIOD = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;

/** ISO timestamp N hours ago. */
const hoursAgo = (h) => new Date(Date.now() - h * 3600_000).toISOString();
const daysAgo = (d) => hoursAgo(d * 24);

/* ------------------------------------------------------------------ */
/* wipe previous demo rows                                             */
/* ------------------------------------------------------------------ */

async function wipe() {
  const demoUsers = await sql`SELECT id FROM users WHERE email LIKE '%@demo.com'`;
  const ids = demoUsers.map((u) => u.id);
  if (ids.length === 0) return 0;

  // Order matters: children before parents.
  await sql`DELETE FROM audit_log WHERE actor_id = ANY(${ids})`;
  await sql`DELETE FROM notifications WHERE user_id = ANY(${ids})`;
  await sql`DELETE FROM rule_change_requests WHERE requested_by = ANY(${ids}) OR reviewed_by = ANY(${ids})`;
  await sql`DELETE FROM self_evaluations WHERE rm_id = ANY(${ids})`;
  await sql`DELETE FROM feedback WHERE author_id = ANY(${ids})`;
  await sql`DELETE FROM action_tasks WHERE action_id IN (SELECT id FROM actions WHERE rm_id = ANY(${ids}))`;
  await sql`DELETE FROM tasks WHERE rm_id = ANY(${ids})`;
  await sql`DELETE FROM actions WHERE rm_id = ANY(${ids})`;
  await sql`DELETE FROM events WHERE rm_id = ANY(${ids})`;
  await sql`DELETE FROM targets WHERE owner_id = ANY(${ids}) OR set_by = ANY(${ids})`;
  await sql`DELETE FROM customers WHERE rm_id = ANY(${ids})`;
  await sql`DELETE FROM rules WHERE updated_by = ANY(${ids})`;
  await sql`UPDATE users SET manager_id = NULL WHERE manager_id = ANY(${ids})`;
  await sql`DELETE FROM users WHERE id = ANY(${ids})`;
  return ids.length;
}

/* ------------------------------------------------------------------ */
/* data definitions                                                    */
/* ------------------------------------------------------------------ */

const SEGMENTS = ["HNI", "retail", "SME", "corporate"];
const STAGES = ["new", "in_progress", "active"];
const SOURCES = ["referral", "campaign", "walk-in", "inbound"];

const COMPANY_NAMES = [
  "Meridian Textiles Pvt Ltd", "Priya Enterprises", "Karan Oberoi",
  "Suresh Traders", "Anand Logistics", "Sunrise Polymers",
  "Kaveri Agro Foods", "Nandini Constructions", "Deccan Auto Parts",
  "Blue Orchid Hospitality", "Vertex Pharma", "Sagar Marine Exports",
  "Lotus Jewellers", "Ratnagiri Steel", "Silverline Apparel",
  "Ganga Chemicals", "Nimbus Softech", "Pearl Diagnostics",
  "Trishul Cements", "Aarav Housing", "Mahalaxmi Motors",
  "Coastal Seafoods", "Vindhya Papers", "Orion Electricals",
];
let companyCursor = 0;
const nextCompany = () => COMPANY_NAMES[companyCursor++ % COMPANY_NAMES.length];

/** Branch 1 is the demo branch manager's team — deliberately varied. */
const RM_SPECS = [
  { key: "rm1", name: "Neha Kulkarni",  email: "rm1@demo.com", branch: "bm1", target: 1000000, achieved: 350000,  customers: 5, closedRatio: 0.35, evalRating: 3 },
  { key: "rm2", name: "Arjun Singh",    email: "rm2@demo.com", branch: "bm1", target: 800000,  achieved: 980000,  customers: 4, closedRatio: 0.85, evalRating: 5 },
  { key: "rm3", name: "Ritu Das",       email: "rm3@demo.com", branch: "bm1", target: 900000,  achieved: 846000,  customers: 4, closedRatio: 0.70, evalRating: 4 },
  { key: "rm4", name: "Sameer Joshi",   email: "rm4@demo.com", branch: "bm1", target: 750000,  achieved: 135000,  customers: 3, closedRatio: 0.20, evalRating: 2 },
  { key: "rm5", name: "Priya Nair",     email: "rm5@demo.com", branch: "bm2", target: 700000,  achieved: 546000,  customers: 3, closedRatio: 0.60, evalRating: 4 },
  { key: "rm6", name: "Imran Sheikh",   email: "rm6@demo.com", branch: "bm2", target: 650000,  achieved: 682000,  customers: 3, closedRatio: 0.75, evalRating: 4 },
];

const RULE_SPECS = [
  ["Follow-up Breach", "RM has not contacted a new/in-progress lead within SLA", { sla_hours: 24, escalation_hours: 48 }, "FOLLOW_UP_BREACH", 1],
  ["Opportunity at Risk", "Pay-in received with no follow-up within window", { followup_window_days: 3 }, "OPPORTUNITY_AT_RISK", 1.2],
  ["Target Gap", "RM tracking meaningfully behind expected run-rate", { gap_threshold_pct: 15 }, "TARGET_GAP", 1],
  ["Special Achievement", "RM crossed 120% of target or has best team conversion", { achievement_pct: 120 }, "ACHIEVEMENT", 0.5],
];

/** How long each action type gets before it is due. Mirrors SLA_HOURS in lib/opportunity.ts. */
const SLA_HOURS = {
  FOLLOW_UP_BREACH: 4,
  OPPORTUNITY_AT_RISK: 24,
  TARGET_GAP: 72,
  ACHIEVEMENT: 168,
};

/**
 * Minutes from now for each open action's deadline, walked in priority order.
 * Hand-picked rather than random so every RM's dashboard opens with a usable
 * spread: a couple inside the 30-minute SLA-risk window, a few later today,
 * and some already breached.
 */
const DEADLINE_LADDER_MINUTES = [14, 26, 47, 105, 168, 252, 430, 890, 1500, -55, -320, -1400];

const EVAL_NOTES = {
  2: "Lost most of the month to a system migration on my desk. Two large leads went cold before I could get to them — I need help re-prioritising.",
  3: "HNI leads are taking longer than the 24h SLA allows because of the compliance pre-check. Volume is fine, speed is not.",
  4: "Steady month. Conversions came mostly from referrals; campaign leads are converting poorly and I'd rather not be assigned more of them.",
  5: "Crossed target early by pushing the pay-in follow-ups the same day they land. Happy to walk the team through what changed.",
};

/* ------------------------------------------------------------------ */
/* seed                                                                */
/* ------------------------------------------------------------------ */

async function main() {
  const wiped = await wipe();
  if (wiped) console.log(`Cleared ${wiped} existing demo user(s) and their data.`);

  const pwHash = await bcrypt.hash("demo123", 10);
  const mkUser = async (name, email, role, managerId = null) => {
    const [row] = await sql`
      INSERT INTO users (name, email, password_hash, role, manager_id)
      VALUES (${name}, ${email}, ${pwHash}, ${role}, ${managerId})
      RETURNING id, name, email`;
    return row;
  };

  const admin = await mkUser("Admin User", "admin@demo.com", "admin");
  const rh = await mkUser("Vikram Rathi", "rh@demo.com", "regional_head");
  const bm1 = await mkUser("Deepak Verma", "bm1@demo.com", "branch_manager", rh.id);
  const bm2 = await mkUser("Anita Rao", "bm2@demo.com", "branch_manager", rh.id);
  const branches = { bm1, bm2 };

  // ---- rules ----
  const ruleIds = {};
  for (const [name, description, condition, actionType, weight] of RULE_SPECS) {
    const [row] = await sql`
      INSERT INTO rules (name, description, condition, action_type, weight, updated_by)
      VALUES (${name}, ${description}, ${JSON.stringify(condition)}, ${actionType}, ${weight}, ${admin.id})
      RETURNING id`;
    ruleIds[actionType] = row.id;
  }

  // ---- branch-manager targets (target_value only; achieved is computed on read) ----
  for (const bm of [bm1, bm2]) {
    const branchTarget = RM_SPECS
      .filter((s) => branches[s.branch].id === bm.id)
      .reduce((sum, s) => sum + s.target, 0);
    await sql`
      INSERT INTO targets (owner_id, owner_role, period, target_value, set_by)
      VALUES (${bm.id}, 'branch_manager', ${PERIOD}, ${branchTarget}, ${rh.id})`;
  }

  const created = [];

  for (const spec of RM_SPECS) {
    const manager = branches[spec.branch];
    const rm = await mkUser(spec.name, spec.email, "rm", manager.id);
    created.push({ ...spec, id: rm.id });

    // ---- targets (current + previous month, so history exists) ----
    await sql`
      INSERT INTO targets (owner_id, owner_role, period, target_value, achieved_value, set_by)
      VALUES (${rm.id}, 'rm', ${PERIOD}, ${spec.target}, ${spec.achieved}, ${manager.id})`;
    await sql`
      INSERT INTO targets (owner_id, owner_role, period, target_value, achieved_value, set_by)
      VALUES (${rm.id}, 'rm', ${PREV_PERIOD}, ${spec.target}, ${Math.round(spec.target * (0.6 + rand() * 0.6))}, ${manager.id})`;

    // ---- customers ----
    const customers = [];
    for (let i = 0; i < spec.customers; i++) {
      const stage = pick(STAGES);
      const assignedHours = between(6, 900);
      const contacted = stage === "new" ? null : hoursAgo(between(2, assignedHours));
      const [c] = await sql`
        INSERT INTO customers (name, rm_id, segment, stage, potential_value, lead_source,
          mobile, email, assigned_at, last_contact_at, next_followup_at)
        VALUES (${nextCompany()}, ${rm.id}, ${pick(SEGMENTS)}, ${stage},
          ${between(80, 950) * 1000}, ${pick(SOURCES)},
          ${`9${between(100000000, 899999999)}`},
          ${`contact${between(10, 99)}@example.in`},
          ${hoursAgo(assignedHours)}, ${contacted},
          ${hoursAgo(-between(12, 240))})
        RETURNING id, name`;
      customers.push(c);
    }

    // ---- events (activity trail over the last 8 weeks) ----
    for (const c of customers) {
      const count = between(1, 4);
      for (let i = 0; i < count; i++) {
        const type = pick(["CALL_LOGGED", "MEETING_COMPLETED", "PAYIN_RECEIVED"]);
        const payload = type === "PAYIN_RECEIVED"
          ? { amount: between(25, 200) * 1000 }
          : {};
        await sql`
          INSERT INTO events (type, customer_id, rm_id, payload, created_at)
          VALUES (${type}, ${c.id}, ${rm.id}, ${JSON.stringify(payload)}, ${daysAgo(between(1, 55))})`;
      }
    }

    // ---- actions ----
    const actions = [];
    const addAction = async ({ type, customer, message, reason, priority, createdDaysAgo, closed, snoozed }) => {
      const createdAt = daysAgo(createdDaysAgo);
      const updatedAt = closed
        ? daysAgo(Math.max(0, createdDaysAgo - between(1, 4)))
        : createdAt;
      const [a] = await sql`
        INSERT INTO actions (customer_id, rm_id, type, message, reason, priority_score,
          status, sla_deadline, snoozed_until, source_rule_id, created_at, updated_at)
        VALUES (${customer?.id ?? null}, ${rm.id}, ${type}, ${message}, ${reason},
          ${priority}, ${closed ? "closed" : "open"},
          ${closed ? hoursAgo(createdDaysAgo * 24 - SLA_HOURS[type]) : null},
          ${snoozed ? hoursAgo(-between(12, 96)) : null},
          ${ruleIds[type] ?? null}, ${createdAt}, ${updatedAt})
        RETURNING id`;
      actions.push({ id: a.id, type, customer, closed });
      return a.id;
    };

    // Customer-linked actions spread over 8 weeks. Completion is decided per
    // customer rather than per action, so "tasks completed" tracks how the RM is
    // actually doing instead of coming out as coin-flip noise.
    for (const c of customers) {
      const n = between(1, 3);
      const taskDone = rand() < spec.closedRatio;
      for (let i = 0; i < n; i++) {
        const type = rand() > 0.45 ? "FOLLOW_UP_BREACH" : "OPPORTUNITY_AT_RISK";
        const createdDaysAgo = between(1, 52);
        // An unfinished task keeps at least its first action open.
        const closed = taskDone || (i > 0 && rand() < spec.closedRatio);
        const snoozed = !closed && rand() > 0.85;
        await addAction({
          type,
          customer: c,
          message: type === "FOLLOW_UP_BREACH"
            ? `${between(26, 96)}h since assignment, no contact yet`
            : `₹${(between(50, 250) * 1000).toLocaleString("en-IN")} pay-in, no follow-up since`,
          reason: type === "FOLLOW_UP_BREACH"
            ? "SLA of 24h breached (configured threshold)"
            : "No contact within the configured 3-day follow-up window",
          priority: between(35, 95),
          createdDaysAgo,
          closed,
          snoozed,
        });
      }
    }

    // target-level action, matching where this RM actually stands
    const achievedPct = (spec.achieved / spec.target) * 100;
    const expectedPct = (now.getDate() / new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()) * 100;
    if (achievedPct >= 120) {
      await addAction({
        type: "ACHIEVEMENT", customer: null,
        message: `Crossed ${achievedPct.toFixed(0)}% of target`,
        reason: "Achievement at/above the configured 120% milestone",
        priority: 20, createdDaysAgo: between(1, 6), closed: false, snoozed: false,
      });
    } else if (achievedPct < expectedPct - 15) {
      await addAction({
        type: "TARGET_GAP", customer: null,
        message: `At ${achievedPct.toFixed(0)}% of target vs ${expectedPct.toFixed(0)}% expected`,
        reason: `Gap of ${(expectedPct - achievedPct).toFixed(0)} points exceeds the configured 15-point threshold`,
        priority: between(55, 85), createdDaysAgo: between(1, 5), closed: false, snoozed: false,
      });
    }

    // ---- deadlines + notifications for whatever is still open ----
    // The dashboard's countdown, SLA-risk tile and bell all read these, so they
    // are written once the RM's open queue is known.
    const openRows = await sql`
      SELECT a.id, a.type, a.priority_score, c.name AS customer_name
      FROM actions a
      LEFT JOIN customers c ON c.id = a.customer_id
      WHERE a.rm_id = ${rm.id} AND a.status = 'open'
      ORDER BY a.priority_score DESC, a.created_at DESC`;

    for (let i = 0; i < openRows.length; i++) {
      const minutes = DEADLINE_LADDER_MINUTES[i % DEADLINE_LADDER_MINUTES.length];
      await sql`
        UPDATE actions SET sla_deadline = ${hoursAgo(-minutes / 60)} WHERE id = ${openRows[i].id}`;
    }

    // Three unread (the badge in the header) and two already-read, newest first.
    const notifyable = openRows.slice(0, 5);
    for (let i = 0; i < notifyable.length; i++) {
      const a = notifyable[i];
      const subject = a.customer_name ?? "your target";
      const [type, title, body] =
        a.type === "TARGET_GAP"
          ? ["target_gap", "You are behind run-rate", `Run-rate check on ${subject} — open the action queue.`]
          : a.type === "ACHIEVEMENT"
            ? ["achievement", "Milestone reached", `You crossed a target milestone on ${subject}.`]
            : a.type === "OPPORTUNITY_AT_RISK"
              ? ["opportunity_at_risk", "Pay-in still uninvested", `${subject} has an uninvested pay-in waiting on you.`]
              : ["sla_risk", "SLA breach risk", `${subject} is approaching its response deadline.`];
      await sql`
        INSERT INTO notifications (user_id, type, payload, read_at, created_at)
        VALUES (${rm.id}, ${type},
          ${JSON.stringify({ title, body, action_id: a.id })},
          ${i < 3 ? null : hoursAgo(between(1, 20))},
          ${hoursAgo(i * 3 + between(1, 3))})`;
    }

    // ---- tasks: one per customer that has actions, plus one target task ----
    const groups = new Map();
    for (const a of actions) {
      const key = a.customer ? `entity:${a.customer.id}` : `target:${rm.id}:current`;
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          title: a.customer ? a.customer.name : `Target for ${PERIOD_LABEL}`,
          actions: [],
        });
      }
      groups.get(key).actions.push(a);
    }
    for (const g of groups.values()) {
      const [task] = await sql`
        INSERT INTO tasks (title, description, task_group_key, rm_id)
        VALUES (${g.title},
          ${`Groups ${g.actions.length} action(s) sharing the same customer/window or target period`},
          ${g.key}, ${rm.id})
        RETURNING id`;
      for (const a of g.actions) {
        await sql`
          INSERT INTO action_tasks (action_id, task_id, weight)
          VALUES (${a.id}, ${task.id}, 1.0)
          ON CONFLICT (action_id, task_id) DO NOTHING`;
      }
    }

    // ---- self-evaluations ----
    await sql`
      INSERT INTO self_evaluations (rm_id, period, self_rating, notes, created_at)
      VALUES (${rm.id}, ${PERIOD}, ${spec.evalRating}, ${EVAL_NOTES[spec.evalRating]}, ${daysAgo(between(1, 8))})`;
    if (rand() > 0.4) {
      const prevRating = Math.max(1, Math.min(5, spec.evalRating + (rand() > 0.5 ? 1 : -1)));
      await sql`
        INSERT INTO self_evaluations (rm_id, period, self_rating, notes, created_at)
        VALUES (${rm.id}, ${PREV_PERIOD}, ${prevRating}, ${EVAL_NOTES[prevRating]}, ${daysAgo(between(32, 50))})`;
    }
  }

  // ---- feedback: a few raised by RMs, one raised by the branch manager ----
  const byKey = Object.fromEntries(created.map((r) => [r.key, r]));
  const feedbackRows = [
    [byKey.rm1.id, "rule_dispute", ruleIds.FOLLOW_UP_BREACH, "24h SLA too tight for HNI leads",
      "Meridian Textiles needed a compliance check before first contact — 24h was not realistic for this segment.", "open", 3],
    [byKey.rm4.id, "system_bug", null, "Pay-in events not updating my achieved value",
      "Logged two pay-ins last week and my target achievement did not move. Numbers on my self-evaluation look wrong.", "open", 6],
    [byKey.rm3.id, "process", null, "Campaign leads arriving without contact numbers",
      "About a third of campaign-sourced leads have no mobile on the record, so the first-contact clock starts before I can call.", "ack", 12],
    [byKey.rm2.id, "other", null, "Request: bulk close for resolved follow-ups",
      "When I clear a backlog after a client visit I have to close each action one at a time.", "resolved", 26],
    [bm1.id, "process", null, "Branch target set after the month started",
      "My branch target for this period landed on the 6th. RM targets could not be split until then, which cost the team a week.", "open", 9],
  ];
  for (const [authorId, category, ruleId, subject, body, status, ago] of feedbackRows) {
    await sql`
      INSERT INTO feedback (author_id, category, related_rule_id, subject, body, status, created_at, resolved_at)
      VALUES (${authorId}, ${category}, ${ruleId}, ${subject}, ${body}, ${status},
        ${daysAgo(ago)}, ${status === "resolved" ? daysAgo(Math.max(0, ago - 4)) : null})`;
  }

  // ---- one pending rule change request, so the admin queue is not empty ----
  await sql`
    INSERT INTO rule_change_requests (rule_id, requested_by, proposed_condition, justification)
    VALUES (${ruleIds.FOLLOW_UP_BREACH}, ${rh.id},
      ${JSON.stringify({ sla_hours: 30, escalation_hours: 48 })},
      'HNI-segment leads consistently need more lead time before first contact across both branches this quarter.')`;

  // ---- optionally promote a real account to branch manager ----
  if (attachEmail) {
    const [row] = await sql`
      UPDATE users SET role = 'branch_manager', manager_id = ${rh.id}
      WHERE email = ${attachEmail}
      RETURNING id, name, email`;
    if (row) {
      // hand them branch 1's RMs so their dashboard is populated
      const branchOneIds = created.filter((r) => r.branch === "bm1").map((r) => r.id);
      await sql`UPDATE users SET manager_id = ${row.id} WHERE id = ANY(${branchOneIds})`;
      const branchTarget = RM_SPECS.filter((s) => s.branch === "bm1").reduce((a, s) => a + s.target, 0);
      await sql`
        INSERT INTO targets (owner_id, owner_role, period, target_value, set_by)
        VALUES (${row.id}, 'branch_manager', ${PERIOD}, ${branchTarget}, ${rh.id})`;
      console.log(`\nAttached: ${row.email} is now a branch manager owning branch 1's ${branchOneIds.length} RMs.`);
    } else {
      console.log(`\nNo user found with email ${attachEmail} — skipped --attach.`);
    }
  }

  console.log(`\nSeed complete for period ${PERIOD}. Password for every demo account: demo123`);
  console.log("  admin@demo.com  Admin");
  console.log("  rh@demo.com     Regional Head (Vikram Rathi)");
  console.log("  bm1@demo.com    Branch Manager (Deepak Verma) — 4 RMs, the one to demo");
  console.log("  bm2@demo.com    Branch Manager (Anita Rao) — 2 RMs");
  for (const r of created) console.log(`  ${r.email.padEnd(15)} RM (${r.name})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
