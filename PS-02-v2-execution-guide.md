# PS-02 v2 — From-Scratch Execution Guide
### 4-role model, task coverage engine, rule request workflow

Follow this top to bottom. It assumes nothing exists yet — no repo, no accounts. Where a piece is unchanged from your original v1 plan (real-time layer, masking helpers, login route) it's marked **unchanged** and given in full anyway, so you never have to flip between two documents mid-build.

---

## Phase 0 — Accounts & installs

1. Install Node.js LTS from `nodejs.org`. Verify: `node -v` and `npm -v`.
2. Install Git (`git --version` on Mac triggers Xcode CLT if missing; `git-scm.com` on Windows; `apt install git` on Linux).
3. Create a GitHub account if you don't have one.
4. Create a Vercel account at `vercel.com` → **Continue with GitHub**.
5. `npm install -g vercel` then `vercel login`, confirm in the browser tab that opens.
6. (Recommended) Install VS Code.

Check each off before moving on — nothing in Phase 1 works without all six.

---

## Phase 1 — Scaffold the project

```bash
npx create-next-app@latest ps02-sales-crm
```
Answer: TypeScript **Yes**, ESLint **Yes**, Tailwind **Yes**, `src/` directory **Yes**, App Router **Yes**, import alias **Yes** (`@/*`).

```bash
cd ps02-sales-crm
npm install @neondatabase/serverless bcryptjs jose ws @upstash/redis recharts react-force-graph-2d
npm install -D @types/bcryptjs @types/ws dotenv tsx
```
New versus v1: `recharts` (weekly report charts) and `react-force-graph-2d` (task coverage graph).

```bash
npx shadcn@latest init
```
Accept defaults (Slate/Zinc, CSS variables Yes). Then:
```bash
npx shadcn@latest add button card badge table input label select tabs separator dialog textarea slider
```
Added `textarea` (feedback/complaint bodies) and `slider` (Regional Head's threshold simulator) to the v1 component list.

Target folder structure:
```
src/
  app/
    login/page.tsx
    (rm)/
      dashboard/page.tsx
      customers/page.tsx
      customers/[id]/page.tsx
      self-evaluation/page.tsx
      feedback/page.tsx
      profile/page.tsx
    (branch-manager)/
      team/page.tsx
      team/[rmId]/page.tsx
      weekly/page.tsx
      notifications/page.tsx
      feedback/page.tsx
    (regional-head)/
      branches/page.tsx
      branches/[branchManagerId]/page.tsx
      weekly/page.tsx
      rules/page.tsx
      notifications/page.tsx
      feedback/page.tsx
    (admin)/
      rules/page.tsx
      rule-requests/page.tsx
      audit-log/page.tsx
    api/
      auth/login/route.ts
      customers/route.ts
      customers/[id]/route.ts
      events/route.ts
      actions/route.ts
      actions/[id]/route.ts
      targets/route.ts
      targets/[ownerId]/route.ts
      team/[managerId]/roster/route.ts
      team/[managerId]/branches/route.ts
      team/[managerId]/weekly/route.ts
      rm/[rmId]/action-graph/route.ts
      rules/route.ts
      rules/[id]/route.ts
      rules/[id]/simulate/route.ts
      rule-requests/route.ts
      rule-requests/[id]/route.ts
      feedback/route.ts
      self-evaluations/route.ts
      notifications/route.ts
      notifications/[id]/route.ts
      ws/route.ts
      cron/evaluate/route.ts
  lib/
    db.ts
    auth.ts
    rules-engine.ts
    task-coverage.ts
    realtime.ts
    masking.ts
  components/
```

---

## Phase 2 — GitHub + Vercel

```bash
git init
git add .
git commit -m "initial scaffold"
```
Create an empty repo `ps02-sales-crm` on github.com, then:
```bash
git remote add origin https://github.com/<your-username>/ps02-sales-crm.git
git branch -M main
git push -u origin main
```
Vercel dashboard → **Add New → Project** → import the repo → default Next.js settings → **Deploy**. It succeeds as a blank app — expected. Every future `git push` now auto-deploys.

---

## Phase 3 — Provision Neon + Upstash

Vercel → your project → **Storage** → **Create Database** → **Neon (Postgres)** → nearest region → **Create**. Then again → **Create Database** → **Upstash (Redis)** → **Create**. Both auto-inject their env vars.

```bash
vercel env pull .env.local
```
Confirms `DATABASE_URL` and the Redis vars are present locally. Never commit `.env.local`.

---

## Phase 4 — Database schema

Open Neon's SQL editor and run this whole block once, in this exact order (later tables reference earlier ones):

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('rm', 'branch_manager', 'regional_head', 'admin')),
  manager_id UUID REFERENCES users(id),
  team_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  rm_id UUID NOT NULL REFERENCES users(id),
  segment TEXT,
  stage TEXT NOT NULL DEFAULT 'new',
  potential_value NUMERIC DEFAULT 0,
  lead_source TEXT,
  mobile TEXT,
  email TEXT,
  assigned_at TIMESTAMPTZ DEFAULT now(),
  last_contact_at TIMESTAMPTZ,
  next_followup_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  customer_id UUID REFERENCES customers(id),
  rm_id UUID REFERENCES users(id),
  payload JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  condition JSONB NOT NULL,
  action_type TEXT NOT NULL,
  weight NUMERIC DEFAULT 1,
  active BOOLEAN DEFAULT true,
  version INT DEFAULT 1,
  effective_date TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id),
  rm_id UUID REFERENCES users(id),
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  reason TEXT,
  priority_score NUMERIC DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open',
  sla_deadline TIMESTAMPTZ,
  source_event_id UUID REFERENCES events(id),
  source_rule_id UUID REFERENCES rules(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- v2: owner-agnostic. owner_role='rm' rows are written directly; owner_role='branch_manager'
-- rows never have achieved_value written to them — it's always computed on read.
CREATE TABLE targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id),
  owner_role TEXT NOT NULL CHECK (owner_role IN ('rm', 'branch_manager')),
  period TEXT NOT NULL,
  target_value NUMERIC NOT NULL,
  achieved_value NUMERIC DEFAULT 0,
  set_by UUID NOT NULL REFERENCES users(id),
  set_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  task_group_key TEXT NOT NULL,
  rm_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (rm_id, task_group_key)
);

CREATE TABLE action_tasks (
  action_id UUID NOT NULL REFERENCES actions(id),
  task_id UUID NOT NULL REFERENCES tasks(id),
  weight NUMERIC DEFAULT 1.0,
  PRIMARY KEY (action_id, task_id)
);

CREATE TABLE feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES users(id),
  category TEXT NOT NULL CHECK (category IN ('rule_dispute', 'system_bug', 'process', 'other')),
  related_rule_id UUID REFERENCES rules(id),
  related_action_id UUID REFERENCES actions(id),
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'ack', 'resolved')),
  created_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE self_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rm_id UUID NOT NULL REFERENCES users(id),
  period TEXT NOT NULL,
  self_rating INT CHECK (self_rating BETWEEN 1 AND 5),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  payload JSONB DEFAULT '{}',
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE rule_change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES rules(id),
  requested_by UUID NOT NULL REFERENCES users(id),
  proposed_condition JSONB NOT NULL,
  proposed_weight NUMERIC,
  justification TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  before JSONB,
  after JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## Phase 5 — Seed script

`scripts/seed.ts` — builds a real two-tier hierarchy: 1 Regional Head, 2 Branch Managers under them, 3 RMs split across those two branches, so every aggregation level (RM → Branch → Region) has something genuine to show.

```ts
import { neon } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';
import 'dotenv/config';

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  const pwHash = await bcrypt.hash('demo123', 10);

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

  const rules = [
    ['Follow-up Breach', 'RM has not contacted a new/in-progress lead within SLA', { sla_hours: 24, escalation_hours: 48 }, 'FOLLOW_UP_BREACH', 1],
    ['Opportunity at Risk', 'Pay-in received with no follow-up within window', { followup_window_days: 3 }, 'OPPORTUNITY_AT_RISK', 1.2],
    ['Target Gap', 'RM tracking meaningfully behind expected run-rate', { gap_threshold_pct: 15 }, 'TARGET_GAP', 1],
    ['Special Achievement', 'RM crossed 120% of target or has best team conversion', { achievement_pct: 120 }, 'ACHIEVEMENT', 0.5],
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

  // RM-level targets — achieved_value is the only place this number is ever written
  await sql`INSERT INTO targets (owner_id, owner_role, period, target_value, achieved_value, set_by) VALUES (${rm1.id}, 'rm', '2026-08', 1000000, 350000, ${bm1.id})`;
  await sql`INSERT INTO targets (owner_id, owner_role, period, target_value, achieved_value, set_by) VALUES (${rm2.id}, 'rm', '2026-08', 800000, 980000, ${bm1.id})`;
  await sql`INSERT INTO targets (owner_id, owner_role, period, target_value, achieved_value, set_by) VALUES (${rm3.id}, 'rm', '2026-08', 900000, 850000, ${bm2.id})`;

  // Branch-manager targets — target_value only, achieved_value left at default and never read for these rows
  await sql`INSERT INTO targets (owner_id, owner_role, period, target_value, set_by) VALUES (${bm1.id}, 'branch_manager', '2026-08', 1800000, ${rh.id})`;
  await sql`INSERT INTO targets (owner_id, owner_role, period, target_value, set_by) VALUES (${bm2.id}, 'branch_manager', '2026-08', 900000, ${rh.id})`;

  // One pre-seeded complaint and one pending rule request, so both queues have something on first login
  await sql`
    INSERT INTO feedback (author_id, category, related_rule_id, subject, body)
    VALUES (${rm1.id}, 'rule_dispute', ${ruleIds['FOLLOW_UP_BREACH']}, '24h SLA too tight for HNI leads',
      'Meridian Textiles needed a compliance check before first contact — 24h was not realistic for this segment.')`;
  await sql`
    INSERT INTO rule_change_requests (rule_id, requested_by, proposed_condition, justification)
    VALUES (${ruleIds['FOLLOW_UP_BREACH']}, ${rh.id}, ${JSON.stringify({ sla_hours: 30, escalation_hours: 48 })},
      'HNI-segment leads consistently need more lead time before first contact across both branches this quarter.')`;

  console.log('Seed complete.');
  console.log('Admin:          admin@demo.com / demo123');
  console.log('Regional Head:  rh@demo.com / demo123');
  console.log('Branch Mgr 1:   bm1@demo.com / demo123 (owns rm1, rm2)');
  console.log('Branch Mgr 2:   bm2@demo.com / demo123 (owns rm3)');
  console.log('RM1 (behind):   rm1@demo.com / demo123');
  console.log('RM2 (achiever): rm2@demo.com / demo123');
  console.log('RM3 (healthy):  rm3@demo.com / demo123');
}

main().catch((e) => { console.error(e); process.exit(1); });
```

```bash
npx tsx scripts/seed.ts
```

---

## Phase 6 — `lib/db.ts` and `lib/auth.ts` (unchanged pattern, role type widened)

```ts
// lib/db.ts
import { neon } from '@neondatabase/serverless';
export const sql = neon(process.env.DATABASE_URL!);
```

```ts
// lib/auth.ts
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

const secret = new TextEncoder().encode(process.env.JWT_SECRET!);

export type Role = 'rm' | 'branch_manager' | 'regional_head' | 'admin';
export type Session = { user_id: string; role: Role; team_id: string | null; name: string };

export async function signToken(payload: Session) {
  return new SignJWT(payload as any).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('8h').sign(secret);
}
export async function verifyToken(token: string): Promise<Session> {
  const { payload } = await jwtVerify(token, secret);
  return payload as unknown as Session;
}
export async function getSession(): Promise<Session | null> {
  const token = cookies().get('token')?.value;
  if (!token) return null;
  try { return await verifyToken(token); } catch { return null; }
}
```
Generate `JWT_SECRET` with `openssl rand -base64 32`, add it to `.env.local` and Vercel's env vars.

```ts
// app/api/auth/login/route.ts — unchanged from v1
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { sql } from '@/lib/db';
import { signToken } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();
  if (!email || !password) return NextResponse.json({ error: 'Email and password required' }, { status: 400 });
  const [user] = await sql`SELECT * FROM users WHERE email = ${email}`;
  if (!user) return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  const token = await signToken({ user_id: user.id, role: user.role, team_id: user.team_id, name: user.name });
  await sql`INSERT INTO audit_log (actor_id, action, entity_type, entity_id) VALUES (${user.id}, 'login', 'user', ${user.id})`;
  const res = NextResponse.json({ role: user.role, name: user.name });
  res.cookies.set('token', token, { httpOnly: true, secure: true, sameSite: 'lax', path: '/' });
  return res;
}
```

```ts
// lib/masking.ts
export function maskMobile(m: string) { return m.slice(0, 2) + '******' + m.slice(-2); }
export function maskEmail(e: string) {
  const [user, domain] = e.split('@');
  return user.slice(0, 2) + '***@' + domain;
}
```

---

## Phase 7 — Rules engine (`lib/rules-engine.ts`) — unchanged from v1

```ts
type Customer = { id: string; rm_id: string; stage: string; potential_value: number; assigned_at: string; last_contact_at: string | null };
type EventRow = { id: string; type: string; customer_id: string | null; rm_id: string | null; payload: any; created_at: string };
type Rule = { id: string; action_type: string; condition: any; weight: number; active: boolean };

export type ActionDraft = {
  rule_id: string; customer_id: string; rm_id: string; type: string;
  message: string; reason: string; priority_score: number; sla_deadline: string | null;
  manager_visible: boolean;
};

function hoursSince(iso: string) { return (Date.now() - new Date(iso).getTime()) / 3600000; }

export function evaluateFollowUpBreach(customer: Customer, rule: Rule): ActionDraft | null {
  if (!rule.active || !['new', 'in_progress'].includes(customer.stage)) return null;
  const slaHours = rule.condition.sla_hours ?? 24;
  const escalationHours = rule.condition.escalation_hours ?? 48;
  const elapsed = hoursSince(customer.assigned_at);
  const contactedSinceAssignment = customer.last_contact_at && new Date(customer.last_contact_at) > new Date(customer.assigned_at);
  if (elapsed > slaHours && !contactedSinceAssignment) {
    const breachRatio = Math.min(elapsed / slaHours, 3);
    const normalizedValue = Math.min(customer.potential_value / 1000000, 1);
    return {
      rule_id: rule.id, customer_id: customer.id, rm_id: customer.rm_id, type: rule.action_type,
      message: `${elapsed.toFixed(0)}h since assignment, no contact yet`,
      reason: `SLA of ${slaHours}h breached (configured threshold)`,
      priority_score: Math.round((breachRatio / 3) * 50 + normalizedValue * 30 + rule.weight * 20),
      sla_deadline: null, manager_visible: elapsed > escalationHours,
    };
  }
  return null;
}

export function evaluateOpportunityAtRisk(event: EventRow, customer: Customer, rule: Rule): ActionDraft | null {
  if (!rule.active || event.type !== 'PAYIN_RECEIVED') return null;
  const windowDays = rule.condition.followup_window_days ?? 3;
  const contactedAfterPayin = customer.last_contact_at && new Date(customer.last_contact_at) > new Date(event.created_at);
  const daysSincePayin = (Date.now() - new Date(event.created_at).getTime()) / 86400000;
  if (daysSincePayin > windowDays && !contactedAfterPayin) {
    const amount = Number(event.payload?.amount ?? 0);
    const breachRatio = Math.min(daysSincePayin / windowDays, 3);
    const normalizedAmount = Math.min(amount / 500000, 1);
    return {
      rule_id: rule.id, customer_id: customer.id, rm_id: customer.rm_id, type: rule.action_type,
      message: `₹${amount.toLocaleString('en-IN')} pay-in, no follow-up since`,
      reason: `No contact within the configured ${windowDays}-day follow-up window`,
      priority_score: Math.round((breachRatio / 3) * 50 + normalizedAmount * 30 + rule.weight * 20),
      sla_deadline: null, manager_visible: true,
    };
  }
  return null;
}

export function evaluateTargetGap(rmId: string, achievedValue: number, targetValue: number, elapsedDays: number, totalDays: number, rule: Rule): ActionDraft | null {
  if (!rule.active || targetValue <= 0) return null;
  const gapThreshold = rule.condition.gap_threshold_pct ?? 15;
  const expectedPct = (elapsedDays / totalDays) * 100;
  const achievedPct = (achievedValue / targetValue) * 100;
  if (achievedPct < expectedPct - gapThreshold) {
    const gap = expectedPct - achievedPct;
    return {
      rule_id: rule.id, customer_id: null as any, rm_id: rmId, type: rule.action_type,
      message: `At ${achievedPct.toFixed(0)}% of target vs ${expectedPct.toFixed(0)}% expected`,
      reason: `Gap of ${gap.toFixed(0)} points exceeds the configured ${gapThreshold}-point threshold`,
      priority_score: Math.round(Math.min(gap / gapThreshold, 3) / 3 * 50 + rule.weight * 30),
      sla_deadline: null, manager_visible: true,
    };
  }
  return null;
}

export function evaluateAchievement(rmId: string, achievedValue: number, targetValue: number, rule: Rule): ActionDraft | null {
  if (!rule.active || targetValue <= 0) return null;
  const achievementPct = rule.condition.achievement_pct ?? 120;
  const achievedPct = (achievedValue / targetValue) * 100;
  if (achievedPct >= achievementPct) {
    return {
      rule_id: rule.id, customer_id: null as any, rm_id: rmId, type: rule.action_type,
      message: `Crossed ${achievedPct.toFixed(0)}% of target`,
      reason: `Achievement at/above the configured ${achievementPct}% milestone`,
      priority_score: Math.round(rule.weight * 20), sla_deadline: null, manager_visible: true,
    };
  }
  return null;
}
```
These four functions are what `simulateRuleChange` (Phase 9) reruns with a proposed condition swapped in — the live engine and the simulator are never two separate implementations that can drift apart.

---

## Phase 8 — Task coverage engine (`lib/task-coverage.ts`) — new in v2

```ts
import { sql } from '@/lib/db';

type ActionRow = { id: string; type: string; rm_id: string; customer_id: string | null; sla_deadline: string | null; priority_score: number; payload?: any };

function clusterKeyFor(action: ActionRow): string {
  if (action.customer_id && action.sla_deadline) {
    const windowBucket = Math.floor(new Date(action.sla_deadline).getTime() / (1000 * 60 * 60 * 6));
    return `entity:${action.customer_id}:${windowBucket}`;
  }
  if (action.type === 'TARGET_GAP' || action.type === 'ACHIEVEMENT') {
    return `target:${action.rm_id}:current`;
  }
  if (action.payload?.campaign_id) {
    return `campaign:${action.payload.campaign_id}`;
  }
  return `solo:${action.id}`;
}

function titleFor(group: ActionRow[]): string {
  if (group.length === 1) return group[0].type.replace(/_/g, ' ');
  return `${group.length} linked actions`;
}

export async function groupActionsIntoTasks(actions: ActionRow[]) {
  const byKey = new Map<string, ActionRow[]>();
  for (const a of actions) {
    const key = clusterKeyFor(a);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(a);
  }

  for (const [key, group] of byKey) {
    let [task] = await sql`SELECT * FROM tasks WHERE rm_id = ${group[0].rm_id} AND task_group_key = ${key}`;
    if (!task) {
      [task] = await sql`
        INSERT INTO tasks (title, description, task_group_key, rm_id)
        VALUES (${titleFor(group)}, ${`Groups ${group.length} action(s) sharing the same customer/window, target period, or campaign`}, ${key}, ${group[0].rm_id})
        RETURNING *`;
    }
    for (const a of group) {
      await sql`
        INSERT INTO action_tasks (action_id, task_id, weight)
        VALUES (${a.id}, ${task.id}, 1.0)
        ON CONFLICT (action_id, task_id) DO NOTHING`;
    }
  }
}

type Edge = { action_id: string; task_id: string; weight: number };
type ScoredAction = { id: string; score: number };

export function computeMinCoverage(edges: Edge[], tasks: { id: string }[], actions: ScoredAction[], budget?: number) {
  const scoreById = new Map(actions.map(a => [a.id, a.score]));
  const actionToTasks = new Map<string, Set<string>>();
  for (const e of edges) {
    if (!actionToTasks.has(e.action_id)) actionToTasks.set(e.action_id, new Set());
    actionToTasks.get(e.action_id)!.add(e.task_id);
  }

  const uncovered = new Set(tasks.map(t => t.id));
  const selected: string[] = [];
  const candidateIds = new Set(actionToTasks.keys());

  while (uncovered.size > 0 && (!budget || selected.length < budget) && candidateIds.size > 0) {
    let best: string | null = null;
    let bestGain = -1;
    let bestScore = -Infinity;
    for (const actionId of candidateIds) {
      const covers = actionToTasks.get(actionId)!;
      let gain = 0;
      for (const t of covers) if (uncovered.has(t)) gain++;
      const score = scoreById.get(actionId) ?? 0;
      if (gain > bestGain || (gain === bestGain && score > bestScore)) { best = actionId; bestGain = gain; bestScore = score; }
    }
    if (best === null || bestGain === 0) break;
    selected.push(best);
    candidateIds.delete(best);
    for (const t of actionToTasks.get(best)!) uncovered.delete(t);
  }

  const coveredTasks = tasks.map(t => t.id).filter(id => !uncovered.has(id));
  return {
    selected_actions: selected,
    covered_tasks: coveredTasks,
    uncovered_tasks: [...uncovered],
    coverage_pct: tasks.length ? Math.round((coveredTasks.length / tasks.length) * 100) : 100,
  };
}
```

**Write the unit test now, before wiring any route to it** (`scripts/test-coverage.ts`, run with `npx tsx`): construct 5 actions and 4 tasks by hand where the optimal cover is exactly 3 actions, with 2 valid-but-redundant actions left over. Assert `selected_actions.length === 3` and that both redundant actions are absent from `selected_actions` but still present in the `edges` you pass in. Do not touch the frontend graph until this passes.

---

## Phase 9 — Real-time layer (`lib/realtime.ts`) — unchanged pattern, one addition

```ts
import { Redis } from '@upstash/redis';
import { sql } from '@/lib/db';

const redis = Redis.fromEnv();

export async function publishEvent(channel: string, payload: unknown) {
  await redis.publish(channel, JSON.stringify(payload));
}

// v2 addition: persist anything that should survive a refresh, not just push live
export async function notify(userId: string, type: string, payload: unknown) {
  await sql`INSERT INTO notifications (user_id, type, payload) VALUES (${userId}, ${type}, ${JSON.stringify(payload)})`;
  await publishEvent(`user:${userId}`, { type, payload });
}
```
Use `notify()` (not bare `publishEvent`) anywhere the recipient should see it again later in their notification inbox: new manager-visible action, rule request decided. Keep bare `publishEvent` for anything purely ephemeral.

For the WebSocket route itself and the local-dev caveat (`vercel dev`, not `next dev`) and the honest polling fallback if pub/sub eats more than 60–90 minutes of your time — nothing about this changes in v2. Build it exactly as your v1 plan already described, and make the same "WebSocket vs. polling" call by the same checkpoint in your schedule.

---

## Phase 10 — API routes

### 10.1 `app/api/customers/route.ts` — now 4-way

```ts
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (session.role === 'rm') {
    const rows = await sql`SELECT * FROM customers WHERE rm_id = ${session.user_id} ORDER BY assigned_at DESC`;
    return NextResponse.json(rows);
  }
  if (session.role === 'branch_manager') {
    const rows = await sql`
      SELECT c.* FROM customers c JOIN users u ON u.id = c.rm_id
      WHERE u.manager_id = ${session.user_id} ORDER BY c.assigned_at DESC`;
    return NextResponse.json(rows);
  }
  if (session.role === 'regional_head') {
    const rows = await sql`
      SELECT c.* FROM customers c
      JOIN users rm ON rm.id = c.rm_id
      JOIN users bm ON bm.id = rm.manager_id
      WHERE bm.manager_id = ${session.user_id} ORDER BY c.assigned_at DESC`;
    return NextResponse.json(rows);
  }
  const rows = await sql`SELECT * FROM customers ORDER BY assigned_at DESC`; // admin
  return NextResponse.json(rows);
}
```

### 10.2 `app/api/customers/[id]/route.ts` — new, the profile drill-down

```ts
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { maskMobile, maskEmail } from '@/lib/masking';

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [customer] = await sql`SELECT * FROM customers WHERE id = ${params.id}`;
  if (!customer) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (session.role === 'rm' && customer.rm_id !== session.user_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (session.role === 'branch_manager') {
    const [rm] = await sql`SELECT manager_id FROM users WHERE id = ${customer.rm_id}`;
    if (rm?.manager_id !== session.user_id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (session.role === 'regional_head') {
    const [chain] = await sql`
      SELECT bm.manager_id AS regional_head_id FROM users rm
      JOIN users bm ON bm.id = rm.manager_id WHERE rm.id = ${customer.rm_id}`;
    if (chain?.regional_head_id !== session.user_id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const timeline = await sql`SELECT * FROM events WHERE customer_id = ${params.id} ORDER BY created_at DESC`;
  const actions = await sql`SELECT * FROM actions WHERE customer_id = ${params.id} ORDER BY created_at DESC`;
  const masked = { ...customer, mobile: customer.mobile ? maskMobile(customer.mobile) : null, email: customer.email ? maskEmail(customer.email) : null };
  return NextResponse.json({ customer: masked, timeline, actions });
}
```

### 10.3 `app/api/events/route.ts` — same as v1, plus one addition that closes the target loop

Keep the whole v1 body (insert event → load customer → run `evaluateFollowUpBreach`/`evaluateOpportunityAtRisk` → insert actions → `publishEvent`). Add this block right after the event insert, so a payment actually moves the needle on `achieved_value` instead of that number sitting static forever:

```ts
if (type === 'PAYIN_RECEIVED') {
  const amount = Number(payload?.amount ?? 0);
  const period = new Date().toISOString().slice(0, 7); // 'YYYY-MM'
  await sql`
    UPDATE targets SET achieved_value = achieved_value + ${amount}
    WHERE owner_id = ${session.user_id} AND owner_role = 'rm' AND period = ${period}`;
}
```

### 10.4 `app/api/actions/route.ts` — now 4-way

Same shape as `customers/route.ts` above, just querying `actions` and filtering `status = 'open'`, with the same three-tier `WHERE` clause for `rm` / `branch_manager` / `regional_head` and the unfiltered admin case.

### 10.5 `app/api/actions/[id]/route.ts` — unchanged from v1

RM ownership check (`before.rm_id !== session.user_id`) stays as the only gate — closing an action is still an RM-only action regardless of how many manager tiers exist above them.

### 10.6 `app/api/targets/route.ts` — new, the write path that didn't exist in v1

```ts
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function POST(req: Request) {
  const session = await getSession();
  if (!session || !['branch_manager', 'regional_head'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { owner_id, period, target_value } = await req.json();

  const [owner] = await sql`SELECT id, role, manager_id FROM users WHERE id = ${owner_id}`;
  if (!owner || owner.manager_id !== session.user_id) {
    return NextResponse.json({ error: 'Forbidden — not your report' }, { status: 403 });
  }
  const expectedOwnerRole = session.role === 'branch_manager' ? 'rm' : 'branch_manager';
  if (owner.role !== expectedOwnerRole) {
    return NextResponse.json({ error: 'Role mismatch' }, { status: 400 });
  }

  const [row] = await sql`
    INSERT INTO targets (owner_id, owner_role, period, target_value, set_by)
    VALUES (${owner_id}, ${expectedOwnerRole}, ${period}, ${target_value}, ${session.user_id})
    RETURNING *`;
  return NextResponse.json(row, { status: 201 });
}
```

### 10.7 `app/api/targets/[ownerId]/route.ts` — GET, same shape as v1

```ts
export async function GET(req: Request, { params }: { params: { ownerId: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role === 'rm' && session.user_id !== params.ownerId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const rows = await sql`SELECT * FROM targets WHERE owner_id = ${params.ownerId} ORDER BY period DESC`;
  return NextResponse.json(rows);
}
```

### 10.8 `app/api/team/[managerId]/roster/route.ts` — Branch Manager's team, extended

```ts
export async function GET(req: Request, { params }: { params: { managerId: string } }) {
  const session = await getSession();
  if (!session || (session.role === 'branch_manager' && session.user_id !== params.managerId) || session.role === 'rm') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const url = new URL(req.url);
  const sortWhitelist = ['name', 'achieved_pct', 'open_action_count', 'open_complaint_count'];
  const sort = sortWhitelist.includes(url.searchParams.get('sort') ?? '') ? url.searchParams.get('sort') : 'name';

  const rows = await sql`
    SELECT u.id, u.name, t.period, t.target_value, t.achieved_value,
      ROUND((t.achieved_value / NULLIF(t.target_value, 0)) * 100, 1) AS achieved_pct,
      (SELECT COUNT(*) FROM actions a WHERE a.rm_id = u.id AND a.status = 'open') AS open_action_count,
      (SELECT COUNT(*) FROM feedback f WHERE f.author_id = u.id AND f.status = 'open') AS open_complaint_count
    FROM users u
    LEFT JOIN targets t ON t.owner_id = u.id AND t.owner_role = 'rm'
    WHERE u.manager_id = ${params.managerId}
    ORDER BY ${sql(sort!)}`;
  return NextResponse.json(rows);
}
```
Building `ORDER BY` from a whitelisted array (never the raw query param) is what keeps this safe from injection while still supporting arbitrary sort.

### 10.9 `app/api/team/[managerId]/branches/route.ts` — new, Regional Head's rollup

```ts
export async function GET(req: Request, { params }: { params: { managerId: string } }) {
  const session = await getSession();
  if (!session || session.role !== 'regional_head' || session.user_id !== params.managerId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const rows = await sql`
    SELECT bm.id AS branch_manager_id, bm.name AS branch_manager_name,
      COALESCE(SUM(t.target_value), 0) AS branch_target,
      COALESCE(SUM(t.achieved_value), 0) AS branch_achieved,
      ROUND(COALESCE(SUM(t.achieved_value), 0) / NULLIF(SUM(t.target_value), 0) * 100, 1) AS branch_achieved_pct
    FROM users bm
    LEFT JOIN users rm ON rm.manager_id = bm.id
    LEFT JOIN targets t ON t.owner_id = rm.id AND t.owner_role = 'rm'
    WHERE bm.manager_id = ${params.managerId}
    GROUP BY bm.id, bm.name
    ORDER BY branch_achieved_pct ASC NULLS LAST`;
  return NextResponse.json(rows);
}
```
Ordering ascending puts the most-behind branch first — the frontend just renders top-to-bottom, no client sort needed for the default "which branch is behind" view.

### 10.10 `app/api/team/[managerId]/weekly/route.ts` — new, weekly reports

This schema has no historical ledger of `achieved_value` over time — only a current snapshot — so don't fabricate a weekly achievement trend. What's genuinely derivable is action volume by week, which is real signal (breach/achievement counts rising or falling):

```ts
export async function GET(req: Request, { params }: { params: { managerId: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rows = await sql`
    SELECT date_trunc('week', a.created_at) AS week, a.type,
      COUNT(*) FILTER (WHERE a.status = 'open') AS open_count,
      COUNT(*) FILTER (WHERE a.status != 'open') AS closed_count
    FROM actions a JOIN users u ON u.id = a.rm_id
    WHERE u.manager_id = ${params.managerId} AND a.created_at > now() - interval '8 weeks'
    GROUP BY week, a.type ORDER BY week`;
  return NextResponse.json(rows);
}
```

### 10.11 `app/api/rm/[rmId]/action-graph/route.ts` — new, the coverage graph

```ts
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { groupActionsIntoTasks, computeMinCoverage } from '@/lib/task-coverage';

export async function GET(req: Request, { params }: { params: { rmId: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role === 'rm' && session.user_id !== params.rmId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  // branch_manager/regional_head reuse the same ownership-chain checks as customers/[id] above — omitted here for brevity, copy that block

  const actions = await sql`SELECT * FROM actions WHERE rm_id = ${params.rmId} AND status = 'open'`;
  await groupActionsIntoTasks(actions as any[]);

  const actionIds = (actions as any[]).map(a => a.id);
  const tasks = actionIds.length
    ? await sql`SELECT DISTINCT t.* FROM tasks t JOIN action_tasks at ON at.task_id = t.id WHERE at.action_id = ANY(${actionIds})`
    : [];
  const edges = actionIds.length
    ? await sql`SELECT * FROM action_tasks WHERE action_id = ANY(${actionIds})`
    : [];

  const { selected_actions, coverage_pct } = computeMinCoverage(
    edges as any[], tasks as any[],
    (actions as any[]).map(a => ({ id: a.id, score: a.priority_score }))
  );

  return NextResponse.json({
    nodes: {
      actions: (actions as any[]).map(a => ({ id: a.id, title: a.message, type: a.type, score: a.priority_score })),
      tasks: (tasks as any[]).map(t => ({ id: t.id, title: t.title })),
    },
    edges,
    recommended_set: selected_actions,
    coverage_pct,
  });
}
```

### 10.12 `app/api/rules/route.ts` — GET now also allows Regional Head (read-only)

```ts
export async function GET() {
  const session = await getSession();
  if (!session || !['admin', 'regional_head'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const rows = await sql`SELECT * FROM rules ORDER BY name`;
  return NextResponse.json(rows);
}
```
`app/api/rules/[id]/route.ts` PATCH stays **exactly as v1** — `session.role !== 'admin'` → 403. This one line is the entire enforcement of "only Admin ever writes a threshold," so don't touch it.

### 10.13 `app/api/rules/[id]/simulate/route.ts` — new, read-only preview

```ts
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { evaluateFollowUpBreach, evaluateOpportunityAtRisk, evaluateTargetGap, evaluateAchievement } from '@/lib/rules-engine';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || !['admin', 'regional_head'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { condition } = await req.json();
  const [rule] = await sql`SELECT * FROM rules WHERE id = ${params.id}`;
  if (!rule) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const proposedRule = { ...rule, condition };
  const affected: string[] = [];
  let checked = 0;

  if (rule.action_type === 'FOLLOW_UP_BREACH') {
    const customers = await sql`SELECT * FROM customers WHERE stage IN ('new','in_progress')`;
    for (const c of customers as any[]) {
      checked++;
      const before = Boolean(evaluateFollowUpBreach(c as any, rule as any));
      const after = Boolean(evaluateFollowUpBreach(c as any, proposedRule as any));
      if (before !== after) affected.push(c.id);
    }
  }
  if (rule.action_type === 'OPPORTUNITY_AT_RISK') {
    const rows = await sql`SELECT e.*, c.* FROM events e JOIN customers c ON c.id = e.customer_id WHERE e.type = 'PAYIN_RECEIVED'`;
    for (const row of rows as any[]) {
      checked++;
      const before = Boolean(evaluateOpportunityAtRisk(row as any, row as any, rule as any));
      const after = Boolean(evaluateOpportunityAtRisk(row as any, row as any, proposedRule as any));
      if (before !== after) affected.push(row.id);
    }
  }
  if (rule.action_type === 'TARGET_GAP' || rule.action_type === 'ACHIEVEMENT') {
    const targets = await sql`SELECT * FROM targets WHERE owner_role = 'rm'`;
    const now = new Date();
    const totalDays = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const elapsedDays = now.getDate();
    for (const t of targets as any[]) {
      checked++;
      const evalFn = (r: any) => rule.action_type === 'TARGET_GAP'
        ? evaluateTargetGap(t.owner_id, t.achieved_value, t.target_value, elapsedDays, totalDays, r)
        : evaluateAchievement(t.owner_id, t.achieved_value, t.target_value, r);
      if (Boolean(evalFn(rule)) !== Boolean(evalFn(proposedRule))) affected.push(t.owner_id);
    }
  }

  return NextResponse.json({ checked, would_flip_count: affected.length, affected_ids: affected });
}
```

### 10.14 `app/api/rule-requests/route.ts` — new

```ts
export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.role !== 'regional_head') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { rule_id, proposed_condition, proposed_weight, justification } = await req.json();
  const [row] = await sql`
    INSERT INTO rule_change_requests (rule_id, requested_by, proposed_condition, proposed_weight, justification)
    VALUES (${rule_id}, ${session.user_id}, ${JSON.stringify(proposed_condition)}, ${proposed_weight ?? null}, ${justification})
    RETURNING *`;
  return NextResponse.json(row, { status: 201 });
}

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const rows = await sql`SELECT * FROM rule_change_requests WHERE status = 'pending' ORDER BY created_at`;
  return NextResponse.json(rows);
}
```

### 10.15 `app/api/rule-requests/[id]/route.ts` — new, the only path that turns a request into a real write

```ts
import { notify } from '@/lib/realtime';

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { decision } = await req.json(); // 'approved' | 'rejected'
  const [request] = await sql`SELECT * FROM rule_change_requests WHERE id = ${params.id}`;
  if (!request) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (decision === 'approved') {
    const [before] = await sql`SELECT * FROM rules WHERE id = ${request.rule_id}`;
    const [after] = await sql`
      UPDATE rules SET condition = ${request.proposed_condition},
        weight = COALESCE(${request.proposed_weight}, weight),
        version = version + 1, updated_by = ${session.user_id}, updated_at = now()
      WHERE id = ${request.rule_id} RETURNING *`;
    await sql`
      INSERT INTO audit_log (actor_id, action, entity_type, entity_id, before, after)
      VALUES (${session.user_id}, 'rule_update_via_request', 'rule', ${request.rule_id}, ${JSON.stringify(before)}, ${JSON.stringify(after)})`;
  }

  const [updated] = await sql`
    UPDATE rule_change_requests SET status = ${decision}, reviewed_by = ${session.user_id}, reviewed_at = now()
    WHERE id = ${params.id} RETURNING *`;
  await notify(request.requested_by, 'rule_request_decided', { rule_id: request.rule_id, decision });
  return NextResponse.json(updated);
}
```

### 10.16 `app/api/feedback/route.ts` — new

```ts
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { category, subject, body, related_rule_id, related_action_id } = await req.json();
  const [row] = await sql`
    INSERT INTO feedback (author_id, category, related_rule_id, related_action_id, subject, body)
    VALUES (${session.user_id}, ${category}, ${related_rule_id ?? null}, ${related_action_id ?? null}, ${subject}, ${body})
    RETURNING *`;
  return NextResponse.json(row, { status: 201 });
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rows = session.role === 'admin'
    ? await sql`SELECT * FROM feedback ORDER BY created_at DESC`
    : await sql`SELECT * FROM feedback WHERE author_id = ${session.user_id} ORDER BY created_at DESC`;
  return NextResponse.json(rows);
}
```

### 10.17 `app/api/self-evaluations/route.ts` — new, same pattern as feedback

```ts
export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.role !== 'rm') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { period, self_rating, notes } = await req.json();
  const [row] = await sql`
    INSERT INTO self_evaluations (rm_id, period, self_rating, notes)
    VALUES (${session.user_id}, ${period}, ${self_rating}, ${notes})
    RETURNING *`;
  return NextResponse.json(row, { status: 201 });
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const url = new URL(req.url);
  const rmId = url.searchParams.get('rm_id') ?? session.user_id;
  if (session.role === 'rm' && rmId !== session.user_id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const rows = await sql`SELECT * FROM self_evaluations WHERE rm_id = ${rmId} ORDER BY period DESC`;
  return NextResponse.json(rows);
}
```

### 10.18 `app/api/notifications/route.ts` and `[id]/route.ts` — new

```ts
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rows = await sql`SELECT * FROM notifications WHERE user_id = ${session.user_id} ORDER BY created_at DESC LIMIT 50`;
  return NextResponse.json(rows);
}
```
```ts
// [id]/route.ts
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const [row] = await sql`UPDATE notifications SET read_at = now() WHERE id = ${params.id} AND user_id = ${session.user_id} RETURNING *`;
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(row);
}
```

### 10.19 `app/api/cron/evaluate/route.ts` — unchanged from v1

Same bearer-secret-protected batch job for `TARGET_GAP`/`ACHIEVEMENT`. One change: swap its `publishEvent` call for `notify()` from Phase 9, so target-gap/achievement alerts also land in the manager's notification inbox, not just the live socket.

---

## Phase 11 — Frontend pages

Build in this order — each reuses the previous one's patterns.

**11.1 `app/login/page.tsx`** — email/password form, redirect by role: `rm` → `/dashboard`, `branch_manager` → `/team`, `regional_head` → `/branches`, `admin` → `/rules`.

**11.2 RM `/dashboard`** — fetch `GET /api/rm/[rmId]/action-graph`, render one `Card` per task (title, status dot, action count). Click expands in place to list every action under it with `reason`, `sla_deadline`, `priority_score`, status. A tab/toggle on the same page swaps to the graph view using `react-force-graph-2d`: actions and tasks as two node shapes, `recommended_set` nodes larger and accent-colored, everything else dimmed (not hidden), edges solid for recommended coverage and dashed for redundant. Clicking an action node's linked customer navigates to `/customers/[id]`.

**11.3 RM `/customers`** — card per customer from `GET /api/customers`. Clicking a card, or clicking a customer name from inside an expanded dashboard action, both land on the same `/customers/[id]` page.

**11.4 RM `/customers/[id]`** — fetch `GET /api/customers/[id]`: masked contact info, segment/stage/value, the event timeline, and any actions tied to this customer. One destination, two entry points, as planned.

**11.5 RM `/self-evaluation`** — form posting to `POST /api/self-evaluations`, history list below it from the GET.

**11.6 RM `/feedback`** — form posting to `POST /api/feedback`; when opened from an action's "dispute this" button, category defaults to `rule_dispute` with `related_rule_id`/`related_action_id` pre-filled from context.

**11.7 RM `/profile`** — own user record, read-only except contact fields.

**11.8 Branch Manager `/team`** — table from `GET /api/team/[managerId]/roster`, column headers clickable to set the `?sort=` param. Row click → `/team/[rmId]`.

**11.9 Branch Manager `/team/[rmId]`** — reuse the RM dashboard component from 11.2, pointed at this RM's id instead of the session's own. Add a target-setting form here (`POST /api/targets`) and customer-reassignment control — this page is both "view" and "manage" for one RM.

**11.10 Branch Manager `/weekly`** — `GET /api/team/[managerId]/weekly` rendered with Recharts as a stacked bar or line chart, open vs. closed counts per week per action type.

**11.11 Branch Manager `/notifications`** — list from `GET /api/notifications`, click marks read via `PATCH /api/notifications/[id]`.

**11.12 Branch Manager `/feedback`** — same component as the RM's feedback page, just posting as this user — their own upward complaints, separate from what they see about their RMs' complaints (which surfaces inline on the roster's `open_complaint_count` column instead).

**11.13 Regional Head `/branches`** — card per branch manager from `GET /api/team/[managerId]/branches`, sorted worst-to-best by default. Click → `/branches/[branchManagerId]`.

**11.14 Regional Head `/branches/[branchManagerId]`** — reuse the Branch Manager's `/team` component exactly, scoped to this branch manager's id. RM row click from here reuses `/team/[rmId]` too. Nothing new gets built on this page — it's the same components entered one level higher, which is the whole point of the hierarchy design.

**11.15 Regional Head `/weekly`** — same chart component as Branch Manager's, called once per branch and stacked, or region-aggregated with a per-branch toggle.

**11.16 Regional Head `/rules`** — list from `GET /api/rules`, a `Slider`/`Input` per condition key, and a "Preview impact" button that calls `POST /api/rules/[id]/simulate` and shows `would_flip_count` live as the slider moves. Below that, a "Request this change" form that calls `POST /api/rule-requests` with a required justification field — no save/commit button exists on this page at all, by design.

**11.17 Admin `/rules`** — unchanged from v1: full edit access, `PATCH /api/rules/[id]` on save.

**11.18 Admin `/rule-requests`** — queue from `GET /api/rule-requests`, each card re-running `POST /api/rules/[id]/simulate` with the proposed condition so Admin sees the same preview Regional Head saw, plus Approve/Reject buttons calling `PATCH /api/rule-requests/[id]`.

**11.19 Admin `/audit-log`** — unchanged from v1, `rule_update_via_request` entries are now distinguishable from direct edits by their `action` value.

---

## Phase 12 — RBAC checklist (4-role version)

- [ ] Every route except `/api/auth/login` calls `getSession()`, 401 if null
- [ ] `PATCH /api/rules/[id]` checks `role === 'admin'` — nothing else can ever reach this line
- [ ] `GET /api/rules` allows `admin` and `regional_head`; `POST /api/rules/[id]/simulate` same two roles, and never writes to `rules`
- [ ] `POST /api/rule-requests` is `regional_head`-only; `PATCH /api/rule-requests/[id]` is `admin`-only
- [ ] `POST /api/targets` checks `owner.manager_id === session.user_id` before any insert — test as a branch manager targeting an RM who isn't theirs, confirm 403
- [ ] `customers`, `actions`, and the new `action-graph` route all filter **inside SQL**, three-tier for `rm`/`branch_manager`/`regional_head`, never filtered in JS after fetching everything
- [ ] `GET /api/customers/[id]` walks the correct number of `manager_id` hops per role (0 for rm, 1 for branch_manager, 2 for regional_head)
- [ ] `password_hash` never appears in a response — audit every `SELECT *` on `users`

Rehearse for the judges: log in as `rm1@demo.com`, try `GET /api/team/<bm1Id>/roster` (403), try `PATCH /api/rules/<id>` (403), try `POST /api/rule-requests` (403 — only Regional Head). Then log in as `rh@demo.com` and try `PATCH /api/rules/<id>` directly (403) — that last one is the demo moment that proves the conflict-of-interest design actually holds under an attack, not just in the pitch.

---

## Phase 13 — Edge cases specific to v2

| Case | Where it's handled |
|---|---|
| Branch Manager's `achieved_value` read before any RM has a target row yet | `SUM()` over an empty join returns `NULL` → `COALESCE(..., 0)` in the branches route |
| Regional Head requests a change, gets rejected, requests again | Each request is its own row — no uniqueness constraint blocks a resubmission; the queue just shows history |
| Task grouping runs twice for the same RM in one session | `task_group_key` uniqueness + `ON CONFLICT DO NOTHING` on `action_tasks` makes `groupActionsIntoTasks` idempotent, safe to call on every dashboard load |
| Customer with no `mobile`/`email` seeded | Masking helpers only run `if (customer.mobile)` / `if (customer.email)` — null passes through, no crash |
| Regional Head views a branch with zero RMs | `LEFT JOIN` in the branches route still returns the branch manager's row with `NULL` aggregates, not an empty result |

---

## Phase 14 — Deploy and verify

```bash
git add .
git commit -m "PS-02 v2: four-role hierarchy, task coverage, rule requests"
git push
```
Confirm `JWT_SECRET`, `CRON_SECRET`, and Redis vars are in Vercel's env settings. Visit the `*.vercel.app` URL and run every scenario below there, not just on `localhost`.

---

## Phase 15 — Demo scenarios (v1's five, plus three new)

1–5. Same as your original guide — follow-up breach, opportunity at risk, RM behind run-rate, RM crosses 120%, live threshold change by Admin.
6. **Task coverage** — as `rm1`, show the dashboard's graph toggle: Meridian Textiles' breach and Priya Enterprises' opportunity are separate tasks, but if you fire a second event against Meridian that also touches the target period, show the graph collapsing two actions into shared coverage.
7. **Branch rollup** — as `rh`, `/branches` shows `bm1`'s branch behind `bm2`'s; drill into `bm1` and it's the exact same team view `bm1` sees when they log in themselves.
8. **Rule request → approval** — as `rh`, open `/rules`, adjust the Follow-up Breach slider, show the live "would flip N actions" preview, submit a request. Log in as `admin`, open `/rule-requests`, show the same preview re-computed server-side, approve it, then show the resulting `audit_log` row with `action = 'rule_update_via_request'`.

---

## Build order recap

Schema → seed → auth/db libs → rules engine → task coverage engine (test before wiring) → API routes in the order listed in Phase 10 → real-time → frontend pages in the order listed in Phase 11 → RBAC checklist → edge cases → deploy → rehearse all eight scenarios twice, out loud, with a timer.
