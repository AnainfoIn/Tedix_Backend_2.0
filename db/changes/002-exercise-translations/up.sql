-- 002 Exercise translations: one row per exercise and language (needs 001)
--
-- Before: translations of exercises, questions and answer options were rows of the generic
--         admin_content_translations table (one row per item, field and language).
-- After:  exercise_translations         one row per exercise + language: name, question, question_body,
--                                       hint, solution, with a status per field (auto / edited / reviewed)
--         exercise_option_translations  one row per answer option + language
--         exercises.original_language_id  the language the exercise is written in (NULL = same as its micro lesson)
--         The existing exercise, question and option rows of admin_content_translations move into them.
--         Rails and the student app do not read translations, so nothing changes for them.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f up.sql
-- Undo: down.sql (moves the rows back).

BEGIN;
SET LOCAL lock_timeout = '10s';

DO $$
BEGIN
  IF to_regclass('public.exercises') IS NULL THEN
    RAISE EXCEPTION 'Apply change 001 (exercises) first';
  END IF;
  IF to_regclass('public.exercise_translations') IS NOT NULL THEN
    RAISE EXCEPTION 'exercise_translations already exists: change 002 was already applied';
  END IF;
END $$;

-- 1. Original language of each exercise.
ALTER TABLE exercises ADD COLUMN original_language_id bigint REFERENCES bx_block_language_options_languages (id);

-- 2. The two translation tables.
CREATE TABLE exercise_translations (
  id bigserial PRIMARY KEY,
  exercise_id bigint NOT NULL REFERENCES exercises (id) ON DELETE CASCADE,
  language_id bigint NOT NULL REFERENCES bx_block_language_options_languages (id),
  name text,
  question text,
  question_body text,
  hint text,
  solution text,
  -- per field: {"question": "auto", "hint": "reviewed"}; a field without a value is missing
  status jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- per field: hash of the original text when it was translated (a different hash = outdated)
  source_hash jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by character varying,
  created_at timestamp(6) without time zone NOT NULL DEFAULT now(),
  updated_at timestamp(6) without time zone NOT NULL DEFAULT now(),
  UNIQUE (exercise_id, language_id)
);
CREATE INDEX index_exercise_translations_on_language_id ON exercise_translations (language_id);

CREATE TABLE exercise_option_translations (
  id bigserial PRIMARY KEY,
  option_id bigint NOT NULL REFERENCES bx_block_assessmenttest_answer_options (id) ON DELETE CASCADE,
  language_id bigint NOT NULL REFERENCES bx_block_language_options_languages (id),
  option text NOT NULL,
  status character varying NOT NULL DEFAULT 'auto',
  source_hash character varying,
  updated_by character varying,
  created_at timestamp(6) without time zone NOT NULL DEFAULT now(),
  updated_at timestamp(6) without time zone NOT NULL DEFAULT now(),
  UNIQUE (option_id, language_id)
);
CREATE INDEX index_exercise_option_translations_on_language_id ON exercise_option_translations (language_id);

-- When an exercise loses or changes its question, the question's translations go with it.
CREATE FUNCTION exercises_question_changed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE exercise_translations
  SET question = NULL, question_body = NULL, hint = NULL, solution = NULL,
      status = status - ARRAY['question', 'questionBody', 'hint', 'solution'],
      source_hash = source_hash - ARRAY['question', 'questionBody', 'hint', 'solution'],
      updated_at = now()
  WHERE exercise_id = NEW.id;
  RETURN NEW;
END $$;
CREATE TRIGGER exercises_question_changed AFTER UPDATE OF question_id ON exercises
FOR EACH ROW WHEN (OLD.question_id IS DISTINCT FROM NEW.question_id) EXECUTE FUNCTION exercises_question_changed();

-- 3. Move the existing translations (only those whose item and language still exist).
DO $$
DECLARE moved_e int := 0; moved_q int := 0; moved_o int := 0;
BEGIN
  IF to_regclass('public.admin_content_languages') IS NOT NULL THEN
    UPDATE exercises e SET original_language_id = l.original_language_id
    FROM admin_content_languages l
    WHERE l.item_type = 'exercise' AND l.item_id = e.id
      AND EXISTS (SELECT 1 FROM bx_block_language_options_languages x WHERE x.id = l.original_language_id);
    DELETE FROM admin_content_languages l WHERE l.item_type = 'exercise' AND EXISTS (SELECT 1 FROM exercises e WHERE e.id = l.item_id);
  END IF;

  IF to_regclass('public.admin_content_translations') IS NULL THEN
    RAISE NOTICE 'admin_content_translations does not exist: no translations to move';
    RETURN;
  END IF;

  -- exercise name (item_id = exercise id) and question fields (item_id = question id), pivoted per exercise + language
  WITH src AS (
    SELECT e.id AS exercise_id, t.language_id, t.field, t.value, t.status, t.source_hash, t.updated_by, t.created_at, t.updated_at
    FROM admin_content_translations t
    JOIN exercises e ON (t.item_type = 'exercise' AND t.field = 'name' AND e.id = t.item_id)
                     OR (t.item_type = 'question' AND t.field IN ('question', 'questionBody', 'hint', 'solution') AND e.question_id = t.item_id)
    WHERE EXISTS (SELECT 1 FROM bx_block_language_options_languages x WHERE x.id = t.language_id)
  )
  INSERT INTO exercise_translations (exercise_id, language_id, name, question, question_body, hint, solution, status, source_hash, updated_by, created_at, updated_at)
  SELECT exercise_id, language_id,
         max(value) FILTER (WHERE field = 'name'),
         max(value) FILTER (WHERE field = 'question'),
         max(value) FILTER (WHERE field = 'questionBody'),
         max(value) FILTER (WHERE field = 'hint'),
         max(value) FILTER (WHERE field = 'solution'),
         jsonb_object_agg(field, status),
         COALESCE(jsonb_object_agg(field, source_hash) FILTER (WHERE source_hash IS NOT NULL), '{}'::jsonb),
         (array_agg(updated_by ORDER BY updated_at DESC))[1],
         min(created_at), max(updated_at)
  FROM src GROUP BY exercise_id, language_id;

  SELECT count(*) INTO moved_e FROM admin_content_translations t
  WHERE t.item_type = 'exercise' AND t.field = 'name' AND EXISTS (SELECT 1 FROM exercises e WHERE e.id = t.item_id)
    AND EXISTS (SELECT 1 FROM bx_block_language_options_languages x WHERE x.id = t.language_id);
  SELECT count(*) INTO moved_q FROM admin_content_translations t
  WHERE t.item_type = 'question' AND t.field IN ('question', 'questionBody', 'hint', 'solution') AND EXISTS (SELECT 1 FROM exercises e WHERE e.question_id = t.item_id)
    AND EXISTS (SELECT 1 FROM bx_block_language_options_languages x WHERE x.id = t.language_id);

  INSERT INTO exercise_option_translations (option_id, language_id, option, status, source_hash, updated_by, created_at, updated_at)
  SELECT t.item_id, t.language_id, t.value, t.status, t.source_hash, t.updated_by, t.created_at, t.updated_at
  FROM admin_content_translations t
  WHERE t.item_type = 'option' AND t.field = 'option'
    AND EXISTS (SELECT 1 FROM bx_block_assessmenttest_answer_options o WHERE o.id = t.item_id)
    AND EXISTS (SELECT 1 FROM bx_block_language_options_languages x WHERE x.id = t.language_id);
  GET DIAGNOSTICS moved_o = ROW_COUNT;

  -- Check every moved value landed, then remove the moved rows from the generic table.
  IF (SELECT count(*) FROM exercise_translations WHERE name IS NOT NULL) <> moved_e
     OR (SELECT count(*) FILTER (WHERE question IS NOT NULL) + count(*) FILTER (WHERE question_body IS NOT NULL)
              + count(*) FILTER (WHERE hint IS NOT NULL) + count(*) FILTER (WHERE solution IS NOT NULL) FROM exercise_translations) <> moved_q THEN
    RAISE EXCEPTION 'Translation counts do not match after the move';
  END IF;

  DELETE FROM admin_content_translations t
  WHERE (t.item_type = 'exercise' AND t.field = 'name' AND EXISTS (SELECT 1 FROM exercise_translations x WHERE x.exercise_id = t.item_id AND x.language_id = t.language_id))
     OR (t.item_type = 'question' AND t.field IN ('question', 'questionBody', 'hint', 'solution')
         AND EXISTS (SELECT 1 FROM exercise_translations x JOIN exercises e ON e.id = x.exercise_id WHERE e.question_id = t.item_id AND x.language_id = t.language_id))
     OR (t.item_type = 'option' AND t.field = 'option' AND EXISTS (SELECT 1 FROM exercise_option_translations x WHERE x.option_id = t.item_id AND x.language_id = t.language_id));

  RAISE NOTICE 'Moved % exercise name, % question and % option translations', moved_e, moved_q, moved_o;
END $$;

COMMENT ON TABLE exercise_translations IS 'Exercise text per language (change 002). Status and source hash per field, keyed by the admin field names name, question, questionBody, hint, solution.';
COMMENT ON TABLE exercise_option_translations IS 'Answer option text per language (change 002).';

COMMIT;
