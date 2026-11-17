-- Security class C13 (RLS written but never applied): every public table that holds a person's data, with whether
-- row-level security is on and how many policies it has. Read-only; safe on any database.
-- A table listed with rls_on = false and 0 policies relies on the app alone to keep one person's rows from another.
-- The planner on 2026-11-16: 72 such tables, none with RLS (todo e776a6f7 holds the plan to apply it).
SELECT c.relname AS table_name,
       c.relrowsecurity AS rls_on,
       (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policies,
       string_agg(a.attname, ',' ORDER BY a.attname) AS person_columns
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
                     AND a.attname IN ('user_id', 'owner_id', 'created_by', 'email', 'author_id')
 WHERE n.nspname = 'public' AND c.relkind = 'r'
 GROUP BY c.oid, c.relname, c.relrowsecurity
 ORDER BY c.relrowsecurity, c.relname;
