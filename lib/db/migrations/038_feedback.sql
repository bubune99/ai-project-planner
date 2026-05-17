-- ============================================================================
-- Migration 038: feedback (in-app point-and-annotate user feedback)
-- ============================================================================
-- Backs the embeddable feedback widget. Per-project, status-tracked so fixes
-- can be checked off and surfaced as admin notifications. Planner/agent sync
-- is deliberately deferred — this is the project-local store first.
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS feedback (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Which app/surface this came from. `source` is a free-text app key so the
  -- same backend can serve many projects (both-layers goal); project_id links
  -- to a planner project when the host app is planner-aware.
  source        TEXT NOT NULL DEFAULT 'unknown',
  project_id    UUID REFERENCES projects(id) ON DELETE SET NULL,

  -- Where + what the user pointed at
  url           TEXT NOT NULL,
  route         TEXT,
  selector      TEXT,                       -- stable DOM selector of target
  target_rect   JSONB,                      -- {x,y,w,h} viewport coords
  annotations   JSONB NOT NULL DEFAULT '[]'::jsonb,  -- boxes/arrows/notes

  -- The message
  title         TEXT,
  comment       TEXT NOT NULL,

  -- Evidence + environment (the "adjust better" payload)
  screenshot    TEXT,                       -- data URL or blob ref
  env           JSONB NOT NULL DEFAULT '{}'::jsonb,  -- viewport,dpr,ua,device,colorScheme,brand,density,locale,tz
  console_logs  JSONB DEFAULT '[]'::jsonb,
  commit_sha    TEXT,

  -- Triage / fix tracking
  status        TEXT NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open','in_progress','fixed','wont_fix','duplicate')),
  priority      TEXT NOT NULL DEFAULT 'normal'
                  CHECK (priority IN ('low','normal','high','urgent')),

  -- Reporter (planner user if authed; name/email for external end-users)
  reporter_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  reporter_name    TEXT,
  reporter_email   TEXT,

  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at   TIMESTAMPTZ,
  resolved_by   UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_feedback_source     ON feedback(source);
CREATE INDEX IF NOT EXISTS idx_feedback_project_id ON feedback(project_id);
CREATE INDEX IF NOT EXISTS idx_feedback_status     ON feedback(status);
CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON feedback(created_at DESC);

COMMENT ON TABLE  feedback            IS 'In-app point-and-annotate user feedback; project-local triage store';
COMMENT ON COLUMN feedback.source     IS 'App key identifying the host project (multi-project collector)';
COMMENT ON COLUMN feedback.selector   IS 'Stable DOM selector of the element the user annotated';
COMMENT ON COLUMN feedback.env        IS 'Captured environment: viewport, dpr, device, colorScheme, brand/density, locale, tz';
COMMENT ON COLUMN feedback.status     IS 'open -> in_progress -> fixed | wont_fix | duplicate';
