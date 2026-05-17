-- Migration: Reconcile legacy documents columns for inline doc/page support
--
-- History: this was originally `002_update_documents_table.sql`, which never
-- applied because (a) it collided with `002_computed_columns.sql` under the
-- filename-sorted runner, and (b) it referenced `s3_key`, a column later
-- renamed to `blob_key` — so it crashed on every attempt and left
-- documents.file_type/file_size/category as NOT NULL, 500ing the
-- create-document API. Renumbered to 037 (after all later migrations) and made
-- fully idempotent + schema-guarded so it is a safe no-op on the current DB
-- and correct on a fresh sequential run.

-- Loosen legacy S3/file columns (no-op if already nullable).
ALTER TABLE documents
  ALTER COLUMN file_type DROP NOT NULL,
  ALTER COLUMN file_size DROP NOT NULL,
  ALTER COLUMN category  DROP NOT NULL;

-- s3_key was renamed to blob_key by a later migration; only touch whichever
-- of the two actually exists.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'documents' AND column_name = 's3_key'
  ) THEN
    EXECUTE 'ALTER TABLE documents ALTER COLUMN s3_key DROP NOT NULL';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'documents' AND column_name = 'blob_key'
  ) THEN
    EXECUTE 'ALTER TABLE documents ALTER COLUMN blob_key DROP NOT NULL';
  END IF;
END $$;

-- Inline-documentation columns (skipped if already present — they are).
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS content        TEXT,
  ADD COLUMN IF NOT EXISTS doc_type       TEXT,
  ADD COLUMN IF NOT EXISTS parent_id      UUID REFERENCES documents(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS last_edited_by TEXT,
  ADD COLUMN IF NOT EXISTS updated_at     TIMESTAMP DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_documents_parent_id ON documents(parent_id);
CREATE INDEX IF NOT EXISTS idx_documents_doc_type  ON documents(doc_type);

-- NOTE: the doc_type CHECK constraint is intentionally NOT set here. Later
-- migrations define the authoritative allowed set
-- (architecture|api|ui_ux|requirements|testing|deployment|general); re-adding
-- the old ('chapter','page') CHECK here would conflict with it.

COMMENT ON COLUMN documents.content   IS 'Markdown content for inline documentation pages';
COMMENT ON COLUMN documents.doc_type  IS 'Document category; allowed values enforced by documents_doc_type_check';
COMMENT ON COLUMN documents.parent_id IS 'Parent chapter ID for hierarchical organization';
