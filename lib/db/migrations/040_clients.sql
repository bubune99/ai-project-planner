-- ============================================================================
-- Migration 040: clients + service_schedules (Client work & ongoing maintenance)
-- ============================================================================
-- Adds a lightweight client layer so a project can belong to a client, plus a
-- recurring "service schedule" layer that mirrors finance_recurring_transactions
-- (reuses the existing recurring_frequency enum + next_occurrence pattern).
--
-- Model:
--   clients            -> the people/companies you do ongoing work for
--   projects.client_id -> optional link from an existing project to a client
--   service_schedules  -> recurring maintenance/retainer obligations (e.g.
--                          "monthly site upkeep") with a next-due date, an
--                          optional SOP runbook, and an optional retainer fee.
-- Billing stays in finance_income_streams (keyed by client name) — not duplicated.
--
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------------------
-- clients
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clients (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  name            TEXT NOT NULL,                -- contact / primary name
  company         TEXT,                         -- company name (for billing match)
  contact_email   TEXT,
  contact_phone   TEXT,

  status          TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','paused','churned','prospect')),

  -- Free reference back to a finance income stream (by name) so billing isn't
  -- duplicated here; the Finance module remains the source of truth for money.
  billing_reference TEXT,

  notes           TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_clients_user_id    ON clients(user_id);
CREATE INDEX IF NOT EXISTS idx_clients_status     ON clients(status);
CREATE INDEX IF NOT EXISTS idx_clients_created_at ON clients(created_at DESC);

COMMENT ON TABLE  clients                   IS 'People/companies you do ongoing client work for';
COMMENT ON COLUMN clients.billing_reference IS 'Free-text link to a finance income stream; Finance stays source of truth for money';
COMMENT ON COLUMN clients.status            IS 'prospect -> active -> paused -> churned';

-- ---------------------------------------------------------------------------
-- projects.client_id  (optional link from an existing project to a client)
-- ---------------------------------------------------------------------------
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_projects_client_id ON projects(client_id);

COMMENT ON COLUMN projects.client_id IS 'Optional client this project belongs to; NULL = internal/own project';

-- ---------------------------------------------------------------------------
-- service_schedules  (recurring maintenance/retainer obligations)
-- Mirrors finance_recurring_transactions: recurring_frequency + next_occurrence.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS service_schedules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  -- Optional project this service is performed against
  project_id      UUID REFERENCES projects(id) ON DELETE SET NULL,
  -- Optional runbook: the SOP to follow when performing this service
  sop_id          UUID REFERENCES sops(id) ON DELETE SET NULL,

  title           TEXT NOT NULL,                -- e.g. "Monthly site upkeep"
  description     TEXT,

  frequency       recurring_frequency NOT NULL DEFAULT 'monthly',
  next_occurrence DATE NOT NULL,
  last_performed_at TIMESTAMPTZ,
  end_date        DATE,                         -- NULL = indefinite

  -- Optional retainer fee for this service (informational; Finance owns money)
  amount          DECIMAL(15,2),
  currency        VARCHAR(3) NOT NULL DEFAULT 'USD',

  is_active       BOOLEAN NOT NULL DEFAULT true,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_service_schedules_user      ON service_schedules(user_id);
CREATE INDEX IF NOT EXISTS idx_service_schedules_client    ON service_schedules(client_id);
CREATE INDEX IF NOT EXISTS idx_service_schedules_project   ON service_schedules(project_id);
CREATE INDEX IF NOT EXISTS idx_service_schedules_next      ON service_schedules(next_occurrence)
  WHERE is_active = true AND deleted_at IS NULL;

COMMENT ON TABLE  service_schedules                 IS 'Recurring maintenance/retainer obligations per client; mirrors finance_recurring_transactions';
COMMENT ON COLUMN service_schedules.sop_id          IS 'Optional SOP runbook to follow when performing this service';
COMMENT ON COLUMN service_schedules.next_occurrence IS 'Next date this service is due; advanced by frequency when marked performed';
COMMENT ON COLUMN service_schedules.amount          IS 'Optional retainer fee (informational); Finance income streams remain source of truth';
