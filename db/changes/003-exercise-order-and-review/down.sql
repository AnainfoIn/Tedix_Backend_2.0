-- 003 Undo: removes the order and the "Check type" flag.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f down.sql
BEGIN;
SET LOCAL lock_timeout = '10s';
DROP TRIGGER exercises_default_position ON exercises;
DROP FUNCTION exercises_default_position();
ALTER TABLE exercises DROP COLUMN review_note;
ALTER TABLE exercises DROP COLUMN needs_review;
ALTER TABLE exercises DROP COLUMN position;
COMMIT;
