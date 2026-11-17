-- 082: the two-way channel between the platform side and a coding session (card f56c9ba0).
--
-- One row per message, threaded by project, card and agent, kept so it survives a session ending and so how often a
-- claim was sent back can be counted (task 344946c5). A request stays open until answered with a real result.

CREATE TABLE IF NOT EXISTS work_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  step_id     uuid NULL REFERENCES project_steps(id) ON DELETE SET NULL,
  agent       text NOT NULL,
  from_side   text NOT NULL CHECK (from_side IN ('session', 'platform', 'owner')),
  kind        text NOT NULL CHECK (kind IN ('request', 'result', 'finished', 'accepted', 'sent_back', 'assign', 'question')),
  body        text NOT NULL,
  proof       jsonb NOT NULL DEFAULT '{}'::jsonb,
  reply_to    uuid NULL REFERENCES work_messages(id) ON DELETE SET NULL,
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'answered', 'closed')),
  created_by  text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  answered_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS work_messages_owed ON work_messages (agent, project_id) WHERE kind = 'request' AND status = 'open';
CREATE INDEX IF NOT EXISTS work_messages_thread ON work_messages (project_id, step_id, created_at);
