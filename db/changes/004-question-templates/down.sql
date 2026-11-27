-- 004 Undo: removes the templates. Exercises keep their sample question, set back to 'regular'.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f down.sql
BEGIN;
SET LOCAL lock_timeout = '10s';
UPDATE exercises SET questionbank_type = 'regular' WHERE question_template IS NOT NULL AND questionbank_type = 'template';
DROP TRIGGER exercises_drop_template_without_question ON exercises;
DROP FUNCTION exercises_drop_template_without_question();
ALTER TABLE exercises DROP COLUMN question_template;
COMMIT;
