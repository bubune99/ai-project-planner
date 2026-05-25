-- Migration 046: Extend idea_facets type enum for Phase 5 / Idea F2
-- Adds three new facet types that bridge ideas → library:
--   spec_draft           — captures preliminary spec for promotion to feature_template
--   acceptance_criteria  — explicit acceptance criteria list
--   prompt_drafts        — prompt-body drafts to be promoted to prompts table on E v2
--
-- See memory: planner-meta-roadmap-septet — Idea F2.
-- Idempotent. Note: ALTER TYPE ADD VALUE requires no transaction in older Postgres,
-- but works inside transactions on Postgres 12+ — keeping plain.

ALTER TYPE facet_type ADD VALUE IF NOT EXISTS 'spec_draft';
ALTER TYPE facet_type ADD VALUE IF NOT EXISTS 'acceptance_criteria';
ALTER TYPE facet_type ADD VALUE IF NOT EXISTS 'prompt_drafts';
