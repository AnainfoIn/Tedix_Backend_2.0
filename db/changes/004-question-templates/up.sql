-- 004 Question templates (needs 001), for the generateQuestion module and its MCP server
--
-- exercises.question_template  NULL = a normal exercise. Otherwise the exercise is a template:
--                              its question, body, hint, solution and answer options with
--                              {placeholders} plus the variables that fill them, as JSON
--                              (see apps/api/src/generate-question/template.ts). Each time the
--                              exercise is served by the 2.0 API, new numbers are drawn.
-- The normal question columns keep one filled-in sample (the example it was made from), so
-- Rails, ActiveAdmin and the student app, which do not know templates, keep showing a valid
-- question. questionbank_type is set to 'template' for these exercises (a value Rails already has).
-- Removing the exercise's question also removes its template.
-- Rails and the student app do not see the column (the old-name views leave it out).
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f up.sql

BEGIN;
SET LOCAL lock_timeout = '10s';

DO $$
BEGIN
  IF to_regclass('public.exercises') IS NULL THEN
    RAISE EXCEPTION 'Apply change 001 (exercises) first';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'exercises' AND column_name = 'question_template') THEN
    RAISE EXCEPTION 'exercises.question_template already exists: change 004 was already applied';
  END IF;
END $$;

ALTER TABLE exercises ADD COLUMN question_template jsonb;
ALTER TABLE exercises ADD CONSTRAINT exercises_question_template_is_object
  CHECK (question_template IS NULL OR jsonb_typeof(question_template) = 'object');

-- A template needs its question: when the question goes (Rails deletes it through the view), the template goes too.
CREATE FUNCTION exercises_drop_template_without_question() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.question_id IS NULL THEN
    NEW.question_template := NULL;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER exercises_drop_template_without_question BEFORE INSERT OR UPDATE ON exercises
FOR EACH ROW EXECUTE FUNCTION exercises_drop_template_without_question();

COMMIT;
