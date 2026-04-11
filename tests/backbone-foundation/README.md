# Backbone Foundation Contract Tests

Contract tests for migrations 033-036 (workers registry, agent_jobs
delegation/unlock, step_instructions, sources federation).

These are **integration tests** — they hit a real Neon Postgres DB through
`lib/db/client.ts`. They need `DATABASE_URL` set (e.g. via `.env.local`) and
they assume migrations 033-036 have been applied via `pnpm db:migrate`.

If `DATABASE_URL` is not set the suite skips cleanly with exit code 0 so
CI environments without DB credentials don't fail.

## Run

```bash
# Apply migrations first
pnpm db:migrate

# Run the suite
pnpm tsx --test tests/backbone-foundation/backbone.test.ts
```

## What's covered

1. **Schema smoke test** — `workers`, `sources` tables exist; `agent_jobs`
   has `worker_id`, `parent_step_id`, `unlock_prompt`, `capabilities_required`;
   `project_steps.step_instructions` exists; the `awaiting-unlock` status is
   allowed by the CHECK constraint.
2. **Worker registration round-trip** — `createWorker` → `listWorkers`
   returns the new worker; `updateWorkerStatus` updates `last_seen_at`.
3. **Unlock lifecycle** — create step + job, `transitionJobToUnlock`,
   `resolveUnlock`, confirm status flows `in_progress → awaiting-unlock → queued`.
4. **Source creation** — `createSource` linked to a step, `listSourcesForStep`
   returns it; `CHECK (source_has_target)` rejects sourceless rows.

All tests clean up after themselves (soft-delete or hard-delete their
test rows) using a unique `TEST_RUN_ID` tag in metadata.

## Known limitations

- No MCP-layer tool tests (would require booting the handler with mocked
  AsyncLocalStorage context). The helpers tested here are what the MCP tools
  delegate to, so coverage is effectively the same.
- No rollback/isolation — tests run inside the main DB. Every created row
  is tagged with a test-run UUID and deleted on success.
