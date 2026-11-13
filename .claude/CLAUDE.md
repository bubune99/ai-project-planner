# AI Project Planner: project notes for Claude

The main guide is the repository's root `CLAUDE.md`. This file only adds the
database safety rule.

## Before any migration

Migrations live in `lib/db/migrations/` and run with `scripts/migrate.ts`,
which targets **production**. Staging is a separate Neon branch.

1. Write the SQL.
2. Check it with `mcp__truth-seeker__validate_migration_safety`
   (`migrationSql`, `codebasePath: "app/"`). If it is not safe, change the
   code first.
3. Running it on production needs the owner's go.

Never source `.env` and never print a secret.
