-- 005 Undo: removes the template links (the template exercises themselves stay).
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f down.sql
BEGIN;
SET LOCAL lock_timeout = '10s';
DROP TABLE question_template_links;
COMMIT;
