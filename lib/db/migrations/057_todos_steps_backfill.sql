-- Migration 057: Backfill project-linked todos into project_steps
--
-- REQUIRES 056 (priority constraint, provenance columns, status normalizer).
-- Idempotent: re-running inserts nothing new, because of the unique index on
-- project_steps.source_todo_id. Safe to run twice.
--
-- WHAT IT DOES NOT DO: it does not delete or complete a single todo. Every
-- migrated todo keeps its row and gains a step_id pointer. If this turns out
-- wrong, DELETE FROM project_steps WHERE source_todo_id IS NOT NULL and the
-- todos are untouched. That is the whole safety story.
--
-- CLASSIFICATION (4 classes, applied in this order):
--   1. project_id IS NULL        -> stays a personal todo. Never a step.
--   2. in the exclusion list     -> stays a todo. Reasons inline below.
--   3. everything else w/ project -> becomes a project_step.
-- Completed todos migrate as completed steps on purpose: that is what makes
-- "Tasks done" and "Progress" read as history rather than as zero.

BEGIN;

CREATE TEMP TABLE todo_backfill_exclusions (
  todo_id UUID PRIMARY KEY,
  reason  TEXT NOT NULL
) ON COMMIT DROP;

-- ── CLASS A: decisions wearing a todo costume ───────────────────────────────
-- These belong in `decisions` via create_decision. Filing them as todos is why
-- the Decisions tab is empty on every project while decisions were in fact
-- being made. Sua alone has two of them and zero decision rows.
INSERT INTO todo_backfill_exclusions (todo_id, reason) VALUES
  ('87af9793-fc73-4396-a8d3-b106af654a6b', 'decision: open production to invited testers (Sua) — OPEN'),
  ('92e5a72c-400c-4487-8c16-2068ed8baf92', 'decision: public sign-up is closed (Sua) — SETTLED 2026-09-29'),
  ('16343e76-94b3-42fb-82d8-6acd9f5697db', 'decision: enforce free-tier AI credit metering (StackDive) — OPEN'),
  ('75687eaa-12bb-4913-a9a2-6b44e8ee56f4', 'decision: one Hexclave project for Farxplor + StackDive — OPEN'),
  ('96780f79-f878-4174-9336-c10bcf03d43d', 'decision: two ToS questions incl. Apache 2.0 grant — OPEN'),
  ('68385bd6-3dcf-4e91-b407-d62e25938768', 'decision: free-MCP-primitive vs paid product line for a11y — OPEN'),
  ('f270c3ba-e689-4303-92a0-3a0ffe4ab464', 'decision: fate of the prototype mobile work (Choir) — OPEN'),
  ('cdff119d-3acb-4517-8eb4-cf7f7f7409b4', 'decision: AI limit = token compute + spend only — OPEN'),
  ('0e409a2b-3628-49a4-beeb-6a91a9d3e9bc', 'decision: BYOK v1 vs hosted gateway — SETTLED'),
  ('6416c9ca-4d5c-413f-9d2c-13e6fdd7a536', 'decision: planner relationship + v1 collaboration stance — SETTLED'),
  ('df34bfe5-b604-45da-8736-d7ea4cdeaeea', 'decision record: platform merger reversed (node 8b7057d4) — SETTLED'),
  ('c0a6ce77-0448-4213-b093-47fb634cc518', 'goal statement, not a step: GOAL SET plumbing/admin/lesson builder');

-- ── CLASS B: owner-only actions with no code ────────────────────────────────
-- A dashboard toggle, a credential rotation, a phone call, a $5 signup. These
-- are not plan steps and should never appear on a Gantt. They are exactly what
-- the todo list is FOR, which is the point: todos keep a real job.
INSERT INTO todo_backfill_exclusions (todo_id, reason) VALUES
  ('15ebce30-915a-4a8e-a55a-982e761a0438', 'owner action: rotate 4 leaked Postgres passwords — the only item with a clock'),
  ('82fbd87d-c20e-4142-bf66-4a1da03684a2', 'owner action: credential rotation batch'),
  ('3df0f0cb-a683-4d07-87f1-66f3c594e513', 'owner action: R2 key rotation + Bot Protection'),
  ('6fbbb431-892b-440b-ac2b-ccfd3ad1564b', 'owner action: set VERCEL_AUTOMATION_BYPASS_SECRET'),
  ('0a7990b1-c3ad-451e-8387-462a4d166893', 'owner action: set CRON_SECRET in Vercel production'),
  ('8bd6d513-bd0e-4b74-aaec-9d4627627e42', 'owner action: confirm Upstash configured in production'),
  ('661181a9-fb21-4f74-b890-d70eac50aa10', 'owner action: set Preview DATABASE_URL via dashboard'),
  ('ad8c5f9b-d09a-4598-a27a-10f0a585e4bf', 'owner action: enable Vercel Web Analytics (paid toggle)'),
  ('e685f855-0419-49e6-b72e-d06123954687', 'owner question: does the sign-in project allow unverified emails'),
  ('536bbb23-862b-4cf2-b3c3-8597bb065c38', 'owner action: cancel the Devin subscription'),
  ('2e04e826-41a7-429c-99b8-da68c982aefa', 'blocked on owner go-ahead: publish @faridea/feedback'),
  ('49944f5e-8d02-443e-8fb7-0e8bd6b4beac', 'blocked on owner go-ahead: commit + push the mobile port'),
  ('1d3a268b-461d-4242-aa97-2b25d18b6528', 'third party: connect theme to the client Shopify store'),
  ('b78e26ed-1d90-4a96-b27c-047d4f7dc3a3', 'third party: install + configure Cowlendar'),
  ('9f5a53d8-e958-4881-9b3f-fa6a11b07885', 'third party: build the product catalog in Shopify admin'),
  ('60e2051d-7114-4ea1-858b-07c6e389652b', 'waiting on the client: social links'),
  ('552503fb-6db7-43b8-8463-af5d3f24e20d', 'waiting on the client: photos, testimonials, gallery'),
  ('21fbee40-cc8c-469c-8dce-5b27db6871aa', 'waiting on a person: native speaker review of the week 1 audio'),
  ('a2e26481-21ee-404b-b67f-a0728a330a45', 'local machine action: restart Claude Code for the BloFin fix'),
  ('e45cfbe1-9df2-4047-9f44-ba35b2c11884', 'local machine action: test get_balance after restart'),
  ('ee6c12bc-feba-4f0d-9a3a-6f3c861f2bb9', 'owner action, done: Chrome Web Store account ($5)'),
  ('a0ad7b14-974d-462e-ba3a-82affcbaf716', 'owner action, done: register CWS developer account'),
  ('95170b80-bfc1-4c28-af51-179215d3e7ca', 'one-off local command, done: vercel link');

-- ── CLASS C: obsolete, superseded, or already announced done in the title ───
INSERT INTO todo_backfill_exclusions (todo_id, reason) VALUES
  ('baa5553c-b54d-4c73-bec3-a2a0257f5c32', 'title says [OBSOLETE]'),
  ('94ae2440-5ee8-40ba-ba9b-ae020fa6f194', 'superseded: Drizzle -> Prisma'),
  ('44fca80e-6910-4afb-ace6-9729f2ba188f', 'title says [DONE] — archive, do not re-enter as a step'),
  ('a3c9ba41-6dc7-4126-b046-0d6a73292a2c', 'title says [DONE] — archive'),
  ('5ecb0ff9-d9c8-4577-a5ad-b0cfbfa61258', 'title says [DONE] — archive'),
  ('db70d08e-53d8-4e15-944f-642ff0737be1', 'title says [DONE] — archive');

-- ── CLASS D: duplicates ─────────────────────────────────────────────────────
-- The OPEX flow pipeline was entered THREE times: once unlinked (project NULL,
-- already excluded by rule 1), once as "Phase A..E", and once as the canonical
-- "Phase 0..F" set. 18 todo rows for 7 real phases. Keep Phase 0-F
-- (a6766d25, 4ec2dc4c, 74b65794, fdca42a8, b0d7c4ff, 7aa91aa4, 9b45046f);
-- exclude the second set. This is the clearest symptom of a flat list with no
-- structure to collide against.
INSERT INTO todo_backfill_exclusions (todo_id, reason) VALUES
  ('14ced858-f234-4238-8b05-d024dd6ca46a', 'duplicate of OPEX Phase A (4ec2dc4c)'),
  ('4dfbff64-92c0-4159-b65a-d27590c27075', 'duplicate of OPEX Phase B (74b65794)'),
  ('7f080404-bf95-4c50-94e9-38b0de33f65d', 'duplicate of OPEX Phase C (fdca42a8)'),
  ('c84ddc86-28da-465f-9ecf-d1256409db9a', 'duplicate of OPEX Phase D (b0d7c4ff)'),
  ('9a1daccc-aa80-42f1-95ed-62000a0084b0', 'duplicate of OPEX Phase E (7aa91aa4)');

-- ── THE INSERT ──────────────────────────────────────────────────────────────
WITH candidates AS (
  SELECT t.*,
         p.current_phase AS project_phase,
         ROW_NUMBER() OVER (
           PARTITION BY t.project_id
           -- open work first, then by the user's own manual order, then oldest
           ORDER BY (t.status = 'completed'), t.order_index, t.created_at
         ) AS seq
  FROM todos t
  JOIN projects p ON p.id = t.project_id
  WHERE t.project_id IS NOT NULL
    AND t.deleted_at IS NULL
    AND t.step_id IS NULL
    AND t.id NOT IN (SELECT todo_id FROM todo_backfill_exclusions)
    -- CLASS E: not this user's plan. system@internal.local owns 14 project-
    -- linked todos written on 2026-05-12 against Mission Control. Eight are a
    -- historical record of work already done; the other six DUPLICATE the
    -- owner's own pending todos ("Wire Notes tab...", "Wire Calendar tab...",
    -- "Build marketing plan..."). Migrating them would put someone else's rows
    -- -- half of them duplicates -- into the owner's roadmap.
    AND NOT EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = t.user_id AND u.email = 'system@internal.local'
    )
)
INSERT INTO project_steps (
  project_id, title, description, status, progress,
  phase, stage, estimated_hours, actual_hours, order_index,
  priority, tasks, tags, metadata,
  source_todo_id, created_at, updated_at, completed_at
)
SELECT
  c.project_id,
  c.title,
  -- description is NOT NULL on project_steps; many todos have none.
  COALESCE(NULLIF(c.description, ''), c.title),
  todo_status_to_step_status(c.status),
  CASE WHEN c.status = 'completed' THEN 100
       WHEN c.status = 'in_progress' THEN 50
       ELSE 0 END,
  -- phase/stage are NOT NULL. Everything lands in one honest bucket rather
  -- than a phase structure invented on the todo's behalf; regroup by hand or
  -- with a later UPDATE once the roadmap is actually designed.
  COALESCE(NULLIF(c.project_phase, ''), 'planning'),
  'imported',
  0, 0,
  c.seq * 10,
  c.priority,
  '[]'::jsonb,
  ARRAY['from-todo'],
  jsonb_build_object(
    'imported_from', 'todos',
    'imported_at', NOW(),
    'migration', '057',
    'original_due_date', c.due_date
  ),
  c.id,
  c.created_at,
  NOW(),
  c.completed_at
FROM candidates c;

-- Point every migrated todo at its step. The todo stays; it becomes a pointer.
UPDATE todos t
   SET step_id = ps.id,
       updated_at = NOW()
  FROM project_steps ps
 WHERE ps.source_todo_id = t.id
   AND t.step_id IS NULL;

-- trigger_update_project_progress (004) already fired per row during the insert
-- above. Recompute once per project anyway: a final full pass is cheap, and it
-- also corrects any project whose progress was left stale by the years in which
-- no steps existed to fire the trigger at all.
UPDATE projects p
   SET progress = (
         SELECT COALESCE(ROUND(AVG(
                  CASE WHEN step_status_kind(ps.project_id, ps.status) = 'done'
                       THEN 100
                       ELSE COALESCE(ps.progress, 0)
                  END
                )), 0)
         FROM project_steps ps
         WHERE ps.project_id = p.id AND ps.deleted_at IS NULL
       ),
       updated_at = NOW()
 WHERE p.deleted_at IS NULL;

COMMIT;
