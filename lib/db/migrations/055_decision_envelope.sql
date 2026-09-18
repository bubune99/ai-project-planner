-- 055: Give decision episodes a 5W+H envelope column
--
-- The agent contract (CLAUDE.md) states that every entity carries a
-- `documentation_5wh` JSONB column, and `get_5wh` / `audit_5wh` accept
-- entity_type 'decision'. But the table those tools actually needed —
-- mlp_why_decisions, where create_decision and list_decisions read and write —
-- never got the column. The tools pointed at architecture_decisions instead
-- (the older ADR feature, 8 rows), which DOES have an envelope but has no
-- user_id, so every get_5wh({entity_type:'decision'}) call failed with
--   column "user_id" does not exist
-- Both halves of that mistake are fixed together: this migration adds the
-- column, and the tool map is repointed at mlp_why_decisions.
--
-- Additive and defaulted, matching every other envelope column in the schema
-- ('{}'::jsonb, NOT NULL). Existing rows get '{}' and read back from get_5wh as
-- "No envelope stored yet" — an honest coverage gap rather than a crash.
-- ADRs stay reachable under their own entity_type ('adr').

ALTER TABLE mlp_why_decisions
  ADD COLUMN IF NOT EXISTS documentation_5wh JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN mlp_why_decisions.documentation_5wh IS
  '5W+H documentation envelope. See lib/validation/documentation-5wh.ts.';
