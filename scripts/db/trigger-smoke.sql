-- Trigger smoke test: fires every table's triggers once (insert, update, delete) and always rolls the change back.
--
-- Why (card d2df6789): update_step_computed_fields read NEW.step_id, a column that does not exist, and nothing caught
-- it until an INSERT failed in production. Run this on the STAGING database after applying a migration, before
-- production: `npx -y tsx@4.23.15 scripts/db/trigger-smoke.ts` with SMOKE_DATABASE_URL set to staging, or paste it
-- into a SQL console. Nothing it does is kept: each statement runs inside a savepoint that is always rolled back.
--
-- Each row of the result: table, op, and "ok", "skipped: ..." (no row to copy, or a constraint refused the copy,
-- which says nothing about the trigger), or "FAIL: <sqlstate> <message>" (a trigger is broken).

CREATE OR REPLACE FUNCTION pg_temp.smoke_one(stmt text) RETURNS text LANGUAGE plpgsql AS $fn$
BEGIN
  BEGIN
    EXECUTE stmt;
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = '__smoke_rollback__';
  EXCEPTION WHEN others THEN
    IF SQLERRM = '__smoke_rollback__' THEN RETURN 'ok'; END IF;
    -- Unique, foreign key, not null and check refusals come from copying a real row, not from a broken trigger.
    IF SQLSTATE IN ('23505', '23503', '23502', '23514', '23P01') THEN RETURN 'skipped: ' || SQLSTATE || ' ' || left(SQLERRM, 160); END IF;
    RETURN 'FAIL: ' || SQLSTATE || ' ' || left(SQLERRM, 300);
  END;
END
$fn$;

CREATE OR REPLACE FUNCTION pg_temp.smoke_table(t regclass) RETURNS TABLE(tbl text, op text, result text) LANGUAGE plpgsql AS $fn$
DECLARE
  has_row boolean;
  has_uuid_id boolean;
  upd_cols text;
  ins_cols text;
  ev int;
BEGIN
  EXECUTE format('SELECT EXISTS (SELECT 1 FROM %s)', t) INTO has_row;
  SELECT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = t AND attname = 'id' AND atttypid = 'uuid'::regtype AND NOT attisdropped) INTO has_uuid_id;
  -- Which events the table's own triggers listen for (bits: 4 insert, 8 delete, 16 update).
  SELECT bit_or(tgtype::int) INTO ev FROM pg_trigger WHERE tgrelid = t AND NOT tgisinternal;
  -- Columns named in UPDATE OF lists, so column-specific triggers fire; otherwise the first real column.
  SELECT string_agg(DISTINCT format('%I = %I', a.attname, a.attname), ', ') INTO upd_cols
    FROM pg_trigger g JOIN pg_attribute a ON a.attrelid = g.tgrelid AND a.attnum = ANY (g.tgattr::int2[])
   WHERE g.tgrelid = t AND NOT g.tgisinternal AND a.attgenerated = '';
  IF upd_cols IS NULL THEN
    SELECT format('%I = %I', attname, attname) INTO upd_cols FROM pg_attribute
     WHERE attrelid = t AND attnum > 0 AND NOT attisdropped AND attgenerated = '' AND attidentity = '' ORDER BY attnum LIMIT 1;
  END IF;

  -- The columns a copy may write: not generated, not GENERATED ALWAYS AS IDENTITY.
  SELECT string_agg(format('%I', attname), ', ' ORDER BY attnum) INTO ins_cols FROM pg_attribute
   WHERE attrelid = t AND attnum > 0 AND NOT attisdropped AND attgenerated = '' AND attidentity <> 'a';

  tbl := t::text;
  IF NOT has_row THEN op := 'all'; result := 'skipped: no row to copy'; RETURN NEXT; RETURN; END IF;
  IF ev & 4 = 4 THEN
    op := 'insert';
    result := pg_temp.smoke_one(CASE WHEN has_uuid_id
      THEN format('INSERT INTO %1$s (%2$s) SELECT %2$s FROM jsonb_populate_record(NULL::%1$s, (SELECT to_jsonb(x) || jsonb_build_object(''id'', gen_random_uuid()) FROM %1$s x LIMIT 1))', t, ins_cols)
      ELSE format('INSERT INTO %1$s (%2$s) SELECT %2$s FROM %1$s LIMIT 1', t, ins_cols) END);
    RETURN NEXT;
  END IF;
  IF ev & 16 = 16 THEN
    op := 'update';
    result := pg_temp.smoke_one(format('UPDATE %1$s SET %2$s WHERE ctid = (SELECT ctid FROM %1$s LIMIT 1)', t, upd_cols));
    RETURN NEXT;
  END IF;
  IF ev & 8 = 8 THEN
    op := 'delete';
    result := pg_temp.smoke_one(format('DELETE FROM %1$s WHERE ctid = (SELECT ctid FROM %1$s LIMIT 1)', t));
    RETURN NEXT;
  END IF;
END
$fn$;

SELECT s.tbl, s.op, s.result
  FROM (SELECT DISTINCT tgrelid FROM pg_trigger g JOIN pg_class c ON c.oid = g.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE NOT g.tgisinternal AND n.nspname = 'public') r,
       LATERAL pg_temp.smoke_table(r.tgrelid::regclass) s
 ORDER BY (s.result LIKE 'FAIL%') DESC, s.tbl, s.op;
