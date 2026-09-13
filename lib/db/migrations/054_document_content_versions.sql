-- 054: Text version history for documents
--
-- Documents became editable in place (MCP update_document, content in
-- PATCH /api/documents/[id]) on 2026-09-13. A `replace` overwrites the body, and
-- the existing document_versions table cannot hold it: that table was built for
-- uploaded files and requires blob_key / blob_url. Without this, an edit had no
-- undo.
--
-- WHY A TRIGGER, not an INSERT in each write path:
--   A BEFORE UPDATE trigger receives OLD — the exact row version being
--   overwritten, after Postgres re-fetches it under the row lock. When two edits
--   race, the second one's OLD already contains the first one's change, so each
--   snapshot is the state that was actually replaced. A snapshot taken by the
--   caller would record whatever it happened to read, which under concurrency is
--   not necessarily what got overwritten.
--   It also covers every writer — MCP, REST, UI, an ad-hoc SQL fix — without
--   each path having to remember to do it.
--
-- VERSIONING is owned by the trigger. `documents.version` counts content/title
-- revisions: it increments only when content or title actually changes, and the
-- replaced state is stored under the version number it had. Metadata-only edits
-- (category, doc_type) are not revisions and do not bump it.
--
-- Storage note: each revision stores the full body, so an append-heavy document
-- grows with the square of its edit count. Fine at current volume; add
-- retention before it isn't.

CREATE TABLE IF NOT EXISTS document_content_versions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id    UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version        INTEGER NOT NULL,
  title          TEXT NOT NULL,
  content        TEXT,
  category       TEXT,
  doc_type       TEXT,
  edited_by      TEXT,        -- who produced this version (OLD.last_edited_by)
  superseded_by  TEXT,        -- who replaced it (NEW.last_edited_by)
  created_at     TIMESTAMP NOT NULL DEFAULT NOW(),  -- when it was replaced
  UNIQUE (document_id, version)
);

CREATE INDEX IF NOT EXISTS idx_document_content_versions_doc
  ON document_content_versions (document_id, version DESC);

COMMENT ON TABLE document_content_versions IS
  'Prior title/content of a document, captured by trigger whenever either changes. One row per replaced revision.';

CREATE OR REPLACE FUNCTION snapshot_document_content()
RETURNS TRIGGER AS $$
DECLARE
  snapshot_version INTEGER;
BEGIN
  IF OLD.content IS DISTINCT FROM NEW.content OR OLD.title IS DISTINCT FROM NEW.title THEN
    -- OLD.version is correct on its own under concurrency (see header). GREATEST
    -- guards the one case it is not: something reset documents.version by hand,
    -- which would otherwise collide with an existing snapshot and block the write.
    -- This runs in a VOLATILE function, so the MAX() takes a fresh snapshot and
    -- sees revisions committed by a transaction this one waited on.
    SELECT GREATEST(
             COALESCE(OLD.version, 1),
             COALESCE(MAX(version), 0) + 1
           )
      INTO snapshot_version
      FROM document_content_versions
     WHERE document_id = OLD.id;

    INSERT INTO document_content_versions
      (document_id, version, title, content, category, doc_type, edited_by, superseded_by)
    VALUES
      (OLD.id, snapshot_version, OLD.title, OLD.content, OLD.category, OLD.doc_type,
       OLD.last_edited_by, NEW.last_edited_by);

    NEW.version := snapshot_version + 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS document_content_version_trigger ON documents;
CREATE TRIGGER document_content_version_trigger
  BEFORE UPDATE OF content, title ON documents
  FOR EACH ROW EXECUTE FUNCTION snapshot_document_content();
