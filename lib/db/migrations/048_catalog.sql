-- Migration 048: Catalog foundation (Idea H Tier 1)
-- Four tables: surfaces, surface_dependencies, validation_contracts, catalog_scan_events.
-- All born with documentation_5wh envelope per the established pattern.
--
-- See memory: idea-h-catalog-first
-- See decisions: 76806cb3 (catalog-first sequence), 293bf973 (no runtime link),
--                4027e98b (git-push trigger), ba9c8ec7 (scan-on-change-only)
--
-- Mental model: the catalog IS the snapshot. Scans verify; agents declare directly.

BEGIN;

-- ============================================================================
-- surfaces — one row per addressable thing in a codebase
-- ============================================================================

CREATE TABLE IF NOT EXISTS surfaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  canonical_id TEXT NOT NULL,                -- e.g. 'mcp:record_attempt', 'db:attempted_solutions.lessons_learned'
  kind TEXT NOT NULL CHECK (kind IN (
    'db_table', 'db_column', 'db_enum', 'db_matview', 'db_function',
    'api_route', 'mcp_tool', 'middleware',
    'ui_page', 'ui_component', 'nav_link',
    'env_var', 'feature_flag', 'config_file',
    'integration', 'webhook_endpoint',
    'helper', 'type_export', 'zod_schema', 'react_hook'
  )),
  project_id UUID,                           -- which planner project (NULL = ambient/cross-project)

  -- Where it lives
  location JSONB NOT NULL DEFAULT '{}',      -- { file_path?, line_start?, line_end?, url_pattern?, table_name?, column_name? }

  -- What it looks like
  signature JSONB NOT NULL DEFAULT '{}',     -- canonical declaration: column types, route params, MCP tool schema, etc.
  content_hash TEXT,                         -- sha256 of normalized signature

  -- Git correlation (lock from idea-h decision 4027e98b)
  first_seen_commit_sha TEXT,                -- the commit that introduced this surface
  last_seen_commit_sha TEXT,                 -- the commit that last touched the hash
  deprecated_in_commit_sha TEXT,             -- set when a scan finds it removed

  -- Lifecycle
  status TEXT NOT NULL DEFAULT 'fresh' CHECK (status IN (
    'fresh', 'needs_revalidation', 'stale', 'deprecated'
  )),

  -- Provenance
  auto_detected_by TEXT NOT NULL DEFAULT 'manual' CHECK (auto_detected_by IN (
    'scan_targeted', 'scan_full', 'agent_artifact', 'manual'
  )),
  last_verified_at TIMESTAMPTZ,
  last_verified_method TEXT CHECK (last_verified_method IN (
    'agent_artifact', 'scan_targeted', 'scan_full', 'manual'
  )),

  -- Ownership + audit + envelope
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',
  documentation_5wh JSONB NOT NULL DEFAULT '{}',

  -- canonical_id is unique per user (so multiple users can have their own catalogs)
  CONSTRAINT surfaces_canonical_user_unique UNIQUE (user_id, canonical_id)
);

CREATE INDEX IF NOT EXISTS idx_surfaces_canonical_id ON surfaces (canonical_id);
CREATE INDEX IF NOT EXISTS idx_surfaces_user ON surfaces (user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_surfaces_kind ON surfaces (kind) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_surfaces_project ON surfaces (project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_surfaces_status ON surfaces (status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_surfaces_first_commit ON surfaces (first_seen_commit_sha);
CREATE INDEX IF NOT EXISTS idx_surfaces_last_commit ON surfaces (last_seen_commit_sha);
CREATE INDEX IF NOT EXISTS idx_surfaces_content_hash ON surfaces (content_hash);
CREATE INDEX IF NOT EXISTS idx_surfaces_5wh ON surfaces USING GIN (documentation_5wh);
CREATE INDEX IF NOT EXISTS idx_surfaces_signature ON surfaces USING GIN (signature);
CREATE INDEX IF NOT EXISTS idx_surfaces_active ON surfaces (user_id, kind) WHERE deleted_at IS NULL AND status != 'deprecated';

COMMENT ON TABLE surfaces IS 'Catalog of every addressable thing in a codebase. Source of truth, not the code. Scans verify; agents declare. See memory:idea-h-catalog-first.';
COMMENT ON COLUMN surfaces.canonical_id IS 'Stable address: mcp:<name>, db:<table>.<col>, route:<METHOD> <path>, ui:<path>, env:<name>';
COMMENT ON COLUMN surfaces.content_hash IS 'sha256 of normalized signature. Drift detector — mismatch with stored = needs_revalidation.';

-- ============================================================================
-- surface_dependencies — typed edges between surfaces
-- ============================================================================

CREATE TABLE IF NOT EXISTS surface_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  from_surface_id UUID NOT NULL REFERENCES surfaces(id) ON DELETE CASCADE,
  to_surface_id UUID NOT NULL REFERENCES surfaces(id) ON DELETE CASCADE,

  kind TEXT NOT NULL CHECK (kind IN (
    'reads_from',      -- API route SELECTs from this table
    'writes_to',       -- API route INSERT/UPDATE/DELETE on this table
    'calls',           -- MCP tool calls this helper / API route calls another route
    'renders',         -- UI page renders this component / displays this DB rows
    'mounts_at',       -- UI page mounts at this URL pattern
    'imports',         -- file imports this export
    'extends',         -- class/type extends another
    'mirrors',         -- API route mirrors an MCP tool (or vice versa)
    'gated_by',        -- surface gated by middleware / auth / feature flag
    'declares',        -- migration declares this table / col / enum
    'fires_event',     -- emits an event the other listens for
    'uses_env',        -- reads this env_var
    'integrates_with'  -- delegates to an external integration
  )),

  -- Confidence: 1.00 = explicit declaration; <1.00 = inferred from scan
  confidence NUMERIC(3,2) NOT NULL DEFAULT 1.00 CHECK (confidence >= 0.00 AND confidence <= 1.00),

  -- Provenance
  auto_detected_by TEXT NOT NULL DEFAULT 'manual' CHECK (auto_detected_by IN (
    'scan_targeted', 'scan_full', 'agent_artifact', 'manual'
  )),

  -- Git correlation (same shape as surfaces)
  first_seen_commit_sha TEXT,
  last_seen_commit_sha TEXT,
  deprecated_in_commit_sha TEXT,

  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  documentation_5wh JSONB NOT NULL DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}',

  CONSTRAINT surface_deps_unique UNIQUE (from_surface_id, to_surface_id, kind, user_id)
);

CREATE INDEX IF NOT EXISTS idx_surface_deps_from ON surface_dependencies (from_surface_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_surface_deps_to ON surface_dependencies (to_surface_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_surface_deps_kind ON surface_dependencies (kind) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_surface_deps_user ON surface_dependencies (user_id);
CREATE INDEX IF NOT EXISTS idx_surface_deps_5wh ON surface_dependencies USING GIN (documentation_5wh);

COMMENT ON TABLE surface_dependencies IS 'Typed edges in the catalog graph. Powers impact analysis k-hop BFS.';

-- ============================================================================
-- validation_contracts — kind → [validator tool + when to invoke]
-- ============================================================================

CREATE TABLE IF NOT EXISTS validation_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  surface_kind TEXT NOT NULL,                -- matches surfaces.kind values
  validator_tool TEXT NOT NULL,              -- MCP tool name (e.g. 'mcp__truth-seeker__validate_migration_safety')
  required BOOLEAN NOT NULL DEFAULT false,   -- true = block completion on failure; false = warn

  trigger_event TEXT NOT NULL CHECK (trigger_event IN (
    'on_create', 'on_modify', 'on_delete', 'always'
  )),

  -- Template for mapping a surface row → tool input arguments
  -- e.g. { "migrationSql": "$signature.sql", "codebasePath": "app/" }
  -- Resolved by the validation router at invoke time
  invoke_args_template JSONB NOT NULL DEFAULT '{}',

  description TEXT,                          -- human-readable why this contract exists

  -- Ownership (NULL = system-seeded; user-id = user-customized override)
  user_id UUID,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}',
  documentation_5wh JSONB NOT NULL DEFAULT '{}',

  -- Same kind/tool/event combo can't be duplicated for the same scope (user or system)
  CONSTRAINT vc_kind_tool_event_user_unique UNIQUE (surface_kind, validator_tool, trigger_event, user_id)
);

CREATE INDEX IF NOT EXISTS idx_vc_surface_kind ON validation_contracts (surface_kind);
CREATE INDEX IF NOT EXISTS idx_vc_trigger ON validation_contracts (trigger_event);
CREATE INDEX IF NOT EXISTS idx_vc_required ON validation_contracts (required) WHERE required = true;

COMMENT ON TABLE validation_contracts IS 'Kind → validator routing table. Truth Seeker MCP tools per surface kind. Seeded in migration 049.';

-- ============================================================================
-- catalog_scan_events — immutable audit log per scan trigger
-- ============================================================================

CREATE TABLE IF NOT EXISTS catalog_scan_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  project_id UUID,
  commit_sha TEXT,                           -- git commit this scan ran against
  branch TEXT,

  scan_type TEXT NOT NULL CHECK (scan_type IN (
    'targeted',  -- scanned specific files (from a push diff)
    'full',      -- scanned the whole tree (bootstrap or manual)
    'skipped'    -- received a trigger but no scannable files
  )),

  scanned_files TEXT[] NOT NULL DEFAULT '{}',    -- files actually scanned (NOT the full push diff)
  skip_reason TEXT,                              -- when scan_type='skipped'

  surfaces_added UUID[] NOT NULL DEFAULT '{}',
  surfaces_modified UUID[] NOT NULL DEFAULT '{}',
  surfaces_removed UUID[] NOT NULL DEFAULT '{}',  -- soft-removed: deprecated_in_commit_sha set

  scan_duration_ms INTEGER,

  triggered_by TEXT NOT NULL CHECK (triggered_by IN (
    'github_webhook', 'vercel_deploy', 'manual_mcp_call',
    'agent_artifact_listener', 'bootstrap'
  )),

  user_id UUID NOT NULL,
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  metadata JSONB NOT NULL DEFAULT '{}'           -- arbitrary scan-context (e.g. agent_id, error_details)
);

CREATE INDEX IF NOT EXISTS idx_scan_events_user ON catalog_scan_events (user_id);
CREATE INDEX IF NOT EXISTS idx_scan_events_project ON catalog_scan_events (project_id);
CREATE INDEX IF NOT EXISTS idx_scan_events_commit ON catalog_scan_events (commit_sha);
CREATE INDEX IF NOT EXISTS idx_scan_events_scanned_at ON catalog_scan_events (scanned_at DESC);
CREATE INDEX IF NOT EXISTS idx_scan_events_type ON catalog_scan_events (scan_type);
CREATE INDEX IF NOT EXISTS idx_scan_events_trigger ON catalog_scan_events (triggered_by);

COMMENT ON TABLE catalog_scan_events IS 'Immutable per-trigger audit log. Even skipped triggers get a row (auditable filtering). Powers "what changed between SHA-A and SHA-B?" queries natively.';

-- ============================================================================
-- Helper view: surface change rate (for drift dashboards later)
-- ============================================================================

CREATE OR REPLACE VIEW surfaces_recent_activity AS
SELECT
  s.id, s.canonical_id, s.kind, s.status, s.user_id,
  s.first_seen_commit_sha, s.last_seen_commit_sha,
  s.last_verified_at, s.last_verified_method,
  -- Count how many scan events touched this surface in last 30 days
  (SELECT COUNT(*) FROM catalog_scan_events e
   WHERE e.user_id = s.user_id
     AND (s.id = ANY(e.surfaces_added) OR s.id = ANY(e.surfaces_modified))
     AND e.scanned_at > NOW() - INTERVAL '30 days') AS scan_touches_30d
FROM surfaces s
WHERE s.deleted_at IS NULL;

COMMENT ON VIEW surfaces_recent_activity IS 'Per-surface change activity in last 30 days. For drift dashboards.';

COMMIT;
