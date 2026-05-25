-- Migration 049: validation_contracts seed data
-- Idea H Tier 3 — maps surface_kind → Truth Seeker MCP tool to invoke.
--
-- Truth Seeker is a global MCP server providing pre-built validators:
--   mcp__truth-seeker__validate_migration_safety
--   mcp__truth-seeker__validate_orm_model
--   mcp__truth-seeker__validate_schema_contract
--   mcp__truth-seeker__validate_api_contract
--   mcp__truth-seeker__validate_api_types
--   mcp__truth-seeker__validate_api_error_handling
--   mcp__truth-seeker__validate_runtime_types
--   mcp__truth-seeker__validate_env_variables
--   mcp__truth-seeker__validate_middleware
--   mcp__truth-seeker__validate_serverless_function
--   mcp__truth-seeker__validate_ssr_rendering
--   mcp__truth-seeker__audit_connectivity_batch
--   mcp__truth-seeker__simulate_webhook_event
--   mcp__truth-seeker__simulate_transaction
--   mcp__truth-seeker__smoke_test_sandbox
--
-- Plus planner-internal validators:
--   planner__mcp_tool_dup_check        — the pre-push dup-check from the cold-start trap
--   planner__mcp_tool_smoke_call       — invoke the tool with synthetic input + assert 200
--   planner__api_route_auth_gate_check — confirm anon GET returns 307→/sign-in (or 401 for API)
--
-- See memory: idea-h-catalog-first
-- See memory: mcp-tool-dup-cold-start-trap
--
-- Strictness policy (locked in idea-h memory):
--   required=true  → completion blocked if validator fails AND surface has explicit contract
--   required=false → completion proceeds but result recorded as warning
--
-- This seed is system-level (user_id IS NULL). Users can override with their own
-- rows (same surface_kind+validator_tool+trigger_event with their user_id).

BEGIN;

-- Idempotent re-seed: clear system rows first so this migration can re-run if the
-- contract set changes. User rows (user_id IS NOT NULL) are preserved.
DELETE FROM validation_contracts WHERE user_id IS NULL;

-- ============================================================================
-- db_table / db_column / db_enum / db_matview
-- ============================================================================

INSERT INTO validation_contracts (surface_kind, validator_tool, required, trigger_event, invoke_args_template, description, documentation_5wh) VALUES

('db_table', 'mcp__truth-seeker__validate_migration_safety', true, 'on_create',
 '{"migrationSql": "$signature.create_sql", "codebasePath": "app/"}',
 'Before adding a table, confirm no existing code references it under a stale assumption.',
 '{}'),

('db_table', 'mcp__truth-seeker__validate_migration_safety', true, 'on_modify',
 '{"migrationSql": "$signature.alter_sql", "codebasePath": "app/"}',
 'Before altering a table, count files/references affected by the change.',
 '{}'),

('db_table', 'mcp__truth-seeker__validate_migration_safety', true, 'on_delete',
 '{"migrationSql": "DROP TABLE $location.table_name", "codebasePath": "app/"}',
 'Dropping a table = high blast radius; must confirm no live references.',
 '{}'),

('db_table', 'mcp__truth-seeker__validate_orm_model', true, 'on_modify',
 '{"modelFilePath": "lib/db/schema/$location.table_name.ts", "tableName": "$location.table_name"}',
 'After schema change, verify ORM definition still matches live DB schema.',
 '{}'),

('db_column', 'mcp__truth-seeker__validate_migration_safety', true, 'on_delete',
 '{"migrationSql": "ALTER TABLE $location.table_name DROP COLUMN $location.column_name", "codebasePath": "app/"}',
 'Dropping a column is the #1 reason migrations break production.',
 '{}'),

('db_column', 'mcp__truth-seeker__validate_orm_model', false, 'on_modify',
 '{"modelFilePath": "lib/db/schema/$location.table_name.ts", "tableName": "$location.table_name"}',
 'Column type changes are usually safe but worth verifying.',
 '{}'),

('db_enum', 'mcp__truth-seeker__validate_migration_safety', true, 'on_modify',
 '{"migrationSql": "$signature.alter_sql", "codebasePath": "app/"}',
 'Removing or renaming enum values breaks existing data; ALTER TYPE ADD VALUE is generally safe.',
 '{}'),

('db_matview', 'mcp__truth-seeker__validate_schema_contract', false, 'on_modify',
 '{"viewName": "$location.matview_name"}',
 'Materialized view refresh contract should match documented shape.',
 '{}'),

-- ============================================================================
-- api_route / webhook_endpoint
-- ============================================================================

('api_route', 'mcp__truth-seeker__validate_api_contract', true, 'on_modify',
 '{"url": "https://v0-ai-project-planner-eight.vercel.app$location.url_pattern", "method": "$signature.method"}',
 'After modifying an API route, verify response shape still matches expected contract.',
 '{}'),

('api_route', 'mcp__truth-seeker__validate_runtime_types', true, 'on_create',
 '{"typeFilePath": "$location.file_path", "typeName": "RouteResponse"}',
 'New API route must have its response type declared and live response must match it.',
 '{}'),

('api_route', 'mcp__truth-seeker__validate_api_error_handling', false, 'on_create',
 '{"url": "https://v0-ai-project-planner-eight.vercel.app$location.url_pattern"}',
 'New routes should handle 4xx + 5xx paths gracefully.',
 '{}'),

('api_route', 'mcp__truth-seeker__validate_serverless_function', false, 'on_modify',
 '{"functionPath": "$location.file_path"}',
 'Serverless function checks (cold start, body parsing, headers).',
 '{}'),

('api_route', 'planner__api_route_auth_gate_check', true, 'on_create',
 '{"url": "https://v0-ai-project-planner-eight.vercel.app$location.url_pattern"}',
 'New API route must enforce auth (return 401 for anonymous).',
 '{}'),

('webhook_endpoint', 'mcp__truth-seeker__simulate_webhook_event', true, 'on_create',
 '{"url": "https://v0-ai-project-planner-eight.vercel.app$location.url_pattern", "provider": "$signature.provider"}',
 'Webhook endpoint must accept and process a synthetic payload from its source provider.',
 '{}'),

('webhook_endpoint', 'mcp__truth-seeker__validate_api_contract', true, 'on_modify',
 '{"url": "https://v0-ai-project-planner-eight.vercel.app$location.url_pattern", "method": "POST"}',
 'Webhook signature verification + response shape must remain intact.',
 '{}'),

-- ============================================================================
-- mcp_tool
-- ============================================================================

('mcp_tool', 'planner__mcp_tool_dup_check', true, 'on_create',
 '{"toolName": "$location.tool_name", "filePath": "app/mcp/route.ts"}',
 'Pre-push uniqueness check — prevents the cold-start "Tool X is already registered" crash. See memory:mcp-tool-dup-cold-start-trap.',
 '{}'),

('mcp_tool', 'planner__mcp_tool_smoke_call', true, 'on_create',
 '{"toolName": "$location.tool_name", "mcpUrl": "https://v0-ai-project-planner-eight.vercel.app/mcp"}',
 'New MCP tool must respond to a synthetic invocation without erroring.',
 '{}'),

('mcp_tool', 'planner__mcp_tool_smoke_call', true, 'on_modify',
 '{"toolName": "$location.tool_name", "mcpUrl": "https://v0-ai-project-planner-eight.vercel.app/mcp"}',
 'Modified MCP tool must still respond cleanly — catches sql.unsafe-style misuse.',
 '{}'),

('mcp_tool', 'mcp__truth-seeker__validate_runtime_types', false, 'on_modify',
 '{"functionPath": "app/mcp/route.ts", "functionName": "$location.tool_name"}',
 'Verify Zod schema still matches actual handler arg destructuring.',
 '{}'),

-- ============================================================================
-- ui_page / ui_component
-- ============================================================================

('ui_page', 'mcp__truth-seeker__validate_ssr_rendering', false, 'on_create',
 '{"url": "https://v0-ai-project-planner-eight.vercel.app$location.route"}',
 'New page should render server-side without errors.',
 '{}'),

('ui_page', 'planner__api_route_auth_gate_check', true, 'on_create',
 '{"url": "https://v0-ai-project-planner-eight.vercel.app$location.route"}',
 'New page must be auth-gated (307→/sign-in for anon) unless explicitly public.',
 '{}'),

-- ============================================================================
-- middleware
-- ============================================================================

('middleware', 'mcp__truth-seeker__validate_middleware', true, 'on_modify',
 '{"middlewarePath": "middleware.ts"}',
 'Middleware changes affect every route; must verify matcher + auth logic intact.',
 '{}'),

-- ============================================================================
-- env_var
-- ============================================================================

('env_var', 'mcp__truth-seeker__validate_env_variables', true, 'on_create',
 '{"envName": "$location.var_name", "codebasePath": "app/", "checkHardcodedSecrets": true}',
 'New env var must be declared in .env.example AND not hardcoded anywhere as a fallback.',
 '{}'),

('env_var', 'mcp__truth-seeker__validate_env_variables', true, 'on_delete',
 '{"envName": "$location.var_name", "codebasePath": "app/"}',
 'Removing an env var requires confirming no code still references it.',
 '{}'),

-- ============================================================================
-- integration
-- ============================================================================

('integration', 'mcp__truth-seeker__audit_connectivity_batch', false, 'on_modify',
 '{"resources": [{"type": "$signature.type", "connectionString": "$signature.connection_ref"}]}',
 'After integration config changes, ensure external service still reachable.',
 '{}'),

('integration', 'mcp__truth-seeker__simulate_transaction', false, 'on_modify',
 '{"provider": "$signature.provider"}',
 'For payment integrations, simulate a transaction end-to-end.',
 '{}'),

('integration', 'mcp__truth-seeker__smoke_test_sandbox', false, 'on_create',
 '{"provider": "$signature.provider"}',
 'For new integrations, run the provider sandbox smoke test.',
 '{}');

-- ============================================================================
-- Verify
-- ============================================================================

-- Count seeded rows by surface kind
DO $$
DECLARE
  total_count INT;
  required_count INT;
BEGIN
  SELECT COUNT(*) INTO total_count FROM validation_contracts WHERE user_id IS NULL;
  SELECT COUNT(*) INTO required_count FROM validation_contracts WHERE user_id IS NULL AND required = true;
  RAISE NOTICE 'Seeded % validation contracts (% required, % advisory).', total_count, required_count, total_count - required_count;
END $$;

COMMIT;
