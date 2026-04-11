-- ============================================================================
-- Migration 035: project_steps.step_instructions (Backbone Foundation)
-- ============================================================================
-- Adds a structured task shape so any worker (Claude, GPT, Gemini, human,
-- cron, webhook) can dispatch against the same step without a per-provider
-- adapter hand-parsing the legacy `tasks` JSONB array of strings.
--
-- The legacy `tasks JSONB` column (from migration 001) is intentionally
-- kept as a fallback — do not drop it.
--
-- Shape (documented in the column comment and mirrored in TS type
-- StepInstructions in lib/db/schema.ts):
--
-- {
--   "intent": "string — one-sentence goal",
--   "context": "string — what the worker needs upfront",
--   "constraints": ["string — things that must NOT happen"],
--   "expected_output": {
--     "kind": "file_edit | artifact | chat_answer | pr | decision | research",
--     "shape": "natural language description"
--   },
--   "required_capabilities": {
--     "tools": ["optional tool names"],
--     "min_context_tokens": 0,
--     "models": ["optional preferred model classes"]
--   },
--   "preconditions": ["string — things that must be true before starting"],
--   "success_criteria": ["string — how we know it's done"]
-- }
--
-- Validation is intentionally light (type check only). Full schema
-- enforcement lives in the TypeScript layer.

ALTER TABLE project_steps
  ADD COLUMN IF NOT EXISTS step_instructions JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Light type check: must be a JSON object (not array / string / number / null-literal).
-- We allow an empty object '{}' which is the default.
ALTER TABLE project_steps
  DROP CONSTRAINT IF EXISTS project_steps_step_instructions_is_object;

ALTER TABLE project_steps
  ADD CONSTRAINT project_steps_step_instructions_is_object
  CHECK (jsonb_typeof(step_instructions) = 'object');

COMMENT ON COLUMN project_steps.step_instructions IS
  'Structured task shape for provider-agnostic dispatch. See TS type StepInstructions in lib/db/schema.ts. Legacy `tasks` JSONB is kept as fallback.';
