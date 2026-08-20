CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  google_id TEXT UNIQUE,
  avatar_url TEXT,
  role TEXT NOT NULL CHECK (role IN ('rm', 'branch_manager', 'regional_head', 'admin')),
  manager_id UUID REFERENCES users(id),
  team_id UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  CHECK (password_hash IS NOT NULL OR google_id IS NOT NULL)
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
