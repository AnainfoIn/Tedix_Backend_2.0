-- 001 Undo: back to two tables, holding whatever is in exercises now (edits made after up.sql are kept).
-- The split of multi-question exercises is not undone; exercise_split_log is kept.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f down.sql

BEGIN;
SET LOCAL lock_timeout = '10s';
LOCK TABLE exercises IN ACCESS EXCLUSIVE MODE;

DROP VIEW bx_block_assessmenttest_questionbanks;
DROP VIEW bx_block_assessmenttest_assessments;
DROP FUNCTION questionbanks_view_write();

ALTER TABLE bx_block_assessmenttest_assessments_legacy RENAME TO bx_block_assessmenttest_assessments;
ALTER TABLE bx_block_assessmenttest_questionbanks_legacy RENAME TO bx_block_assessmenttest_questionbanks;

DELETE FROM bx_block_assessmenttest_questionbanks;
DELETE FROM bx_block_assessmenttest_assessments;
INSERT INTO bx_block_assessmenttest_assessments
  (id, name, created_at, updated_at, lesson_id, micro_lesson_id, category_type, category_id, sub_category_id,
   course_id, main_id, unit_id, country_id, is_aha)
SELECT id, name, created_at, updated_at, lesson_id, micro_lesson_id, category_type, category_id, sub_category_id,
       course_id, main_id, unit_id, country_id, is_aha
FROM exercises;
INSERT INTO bx_block_assessmenttest_questionbanks
  (id, assessment_id, created_at, updated_at, question, question_body, solution, hint, question_type, questionbank_type)
SELECT question_id, id, question_created_at, question_updated_at, question, question_body, solution, hint, question_type, questionbank_type
FROM exercises WHERE question_id IS NOT NULL;

-- Foreign keys that point at exercises go back to the old tables.
DO $$
DECLARE c record; target text;
BEGIN
  FOR c IN
    SELECT con.conname, con.conrelid::regclass AS child,
           (SELECT string_agg(attname, ',') FROM pg_attribute WHERE attrelid = con.confrelid AND attnum = ANY (con.confkey)) AS parent_cols,
           (SELECT string_agg(quote_ident(attname), ', ') FROM pg_attribute WHERE attrelid = con.conrelid AND attnum = ANY (con.conkey)) AS cols
    FROM pg_constraint con
    WHERE con.contype = 'f' AND con.confrelid = 'exercises'::regclass
  LOOP
    target := CASE WHEN c.parent_cols = 'id' THEN 'bx_block_assessmenttest_assessments (id)' ELSE 'bx_block_assessmenttest_questionbanks (id)' END;
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', c.child, c.conname);
    EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (%s) REFERENCES %s', c.child, c.conname, c.cols, target);
  END LOOP;
END $$;

ALTER TABLE exercises ALTER COLUMN id DROP DEFAULT;
ALTER SEQUENCE exercises_id_seq OWNED BY bx_block_assessmenttest_assessments.id;
ALTER SEQUENCE exercises_question_id_seq OWNED BY bx_block_assessmenttest_questionbanks.id;
ALTER SEQUENCE exercises_id_seq RENAME TO bx_block_assessmenttest_assessments_id_seq;
ALTER SEQUENCE exercises_question_id_seq RENAME TO bx_block_assessmenttest_questionbanks_id_seq;
ALTER TABLE bx_block_assessmenttest_assessments ALTER COLUMN id SET DEFAULT nextval('bx_block_assessmenttest_assessments_id_seq');
ALTER TABLE bx_block_assessmenttest_questionbanks ALTER COLUMN id SET DEFAULT nextval('bx_block_assessmenttest_questionbanks_id_seq');

DROP TABLE exercises;

COMMIT;
