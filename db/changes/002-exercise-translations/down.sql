-- 002 Undo: translations go back to admin_content_translations, the two tables and
-- exercises.original_language_id are removed.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f down.sql

BEGIN;
SET LOCAL lock_timeout = '10s';

CREATE TABLE IF NOT EXISTS admin_content_translations (
  id bigserial PRIMARY KEY,
  item_type varchar NOT NULL,
  item_id bigint NOT NULL,
  field varchar NOT NULL,
  language_id bigint NOT NULL,
  value text NOT NULL,
  status varchar NOT NULL DEFAULT 'auto',
  source_hash varchar,
  updated_by varchar,
  created_at timestamp(6) NOT NULL DEFAULT now(),
  updated_at timestamp(6) NOT NULL DEFAULT now(),
  UNIQUE (item_type, item_id, field, language_id)
);
CREATE TABLE IF NOT EXISTS admin_content_languages (
  item_type varchar NOT NULL,
  item_id bigint NOT NULL,
  original_language_id bigint NOT NULL,
  updated_at timestamp(6) NOT NULL DEFAULT now(),
  PRIMARY KEY (item_type, item_id)
);

INSERT INTO admin_content_translations (item_type, item_id, field, language_id, value, status, source_hash, updated_by, created_at, updated_at)
SELECT CASE WHEN f.field = 'name' THEN 'exercise' ELSE 'question' END,
       CASE WHEN f.field = 'name' THEN e.id ELSE e.question_id END,
       f.field, t.language_id, f.value, COALESCE(t.status ->> f.field, 'auto'), t.source_hash ->> f.field, t.updated_by, t.created_at, t.updated_at
FROM exercise_translations t
JOIN exercises e ON e.id = t.exercise_id
CROSS JOIN LATERAL (VALUES ('name', t.name), ('question', t.question), ('questionBody', t.question_body), ('hint', t.hint), ('solution', t.solution)) f (field, value)
WHERE f.value IS NOT NULL AND (f.field = 'name' OR e.question_id IS NOT NULL)
ON CONFLICT (item_type, item_id, field, language_id) DO UPDATE
  SET value = EXCLUDED.value, status = EXCLUDED.status, source_hash = EXCLUDED.source_hash, updated_by = EXCLUDED.updated_by, updated_at = EXCLUDED.updated_at;

INSERT INTO admin_content_translations (item_type, item_id, field, language_id, value, status, source_hash, updated_by, created_at, updated_at)
SELECT 'option', option_id, 'option', language_id, option, status, source_hash, updated_by, created_at, updated_at
FROM exercise_option_translations
ON CONFLICT (item_type, item_id, field, language_id) DO UPDATE
  SET value = EXCLUDED.value, status = EXCLUDED.status, source_hash = EXCLUDED.source_hash, updated_by = EXCLUDED.updated_by, updated_at = EXCLUDED.updated_at;

INSERT INTO admin_content_languages (item_type, item_id, original_language_id, updated_at)
SELECT 'exercise', id, original_language_id, now() FROM exercises WHERE original_language_id IS NOT NULL
ON CONFLICT (item_type, item_id) DO UPDATE SET original_language_id = EXCLUDED.original_language_id, updated_at = now();

DROP TRIGGER exercises_question_changed ON exercises;
DROP FUNCTION exercises_question_changed();
DROP TABLE exercise_option_translations;
DROP TABLE exercise_translations;
ALTER TABLE exercises DROP COLUMN original_language_id;

COMMIT;
