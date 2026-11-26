-- 001 Merge questions into exercises (one table: exercises)
--
-- Before: bx_block_assessmenttest_assessments (exercise) 1 ── * bx_block_assessmenttest_questionbanks (question)
-- After:  exercises, one row per exercise holding its question too.
--         The two old names become views over exercises, so Rails, the student app and any
--         old SQL keep reading and writing them with the same columns and the same ids.
--
-- Run once per database, in one transaction:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f up.sql
-- Rails must already run with the primary-key fix (see docs/DB_CHANGES.md), because Rails
-- cannot find the primary key of a view on its own.
-- Undo: down.sql (the split of multi-question exercises in step 1 is kept).

BEGIN;
SET LOCAL lock_timeout = '10s';

DO $$
BEGIN
  IF to_regclass('public.exercises') IS NOT NULL THEN
    RAISE EXCEPTION 'exercises already exists: change 001 was already applied';
  END IF;
  -- A view built on the old tables would keep reading the *_legacy copy after the rename.
  IF EXISTS (SELECT 1 FROM pg_depend d JOIN pg_rewrite r ON r.oid = d.objid
             WHERE d.refobjid IN ('bx_block_assessmenttest_assessments'::regclass, 'bx_block_assessmenttest_questionbanks'::regclass)
               AND r.ev_class NOT IN ('bx_block_assessmenttest_assessments'::regclass, 'bx_block_assessmenttest_questionbanks'::regclass)) THEN
    RAISE EXCEPTION 'A view depends on the exercise or question table; see check-before.sql';
  END IF;
END $$;

-- Lock both tables so nothing writes while they are copied.
LOCK TABLE bx_block_assessmenttest_assessments, bx_block_assessmenttest_questionbanks IN ACCESS EXCLUSIVE MODE;

-- 1. Split exercises that have more than one question. The lowest question id stays on the
--    exercise; every other question moves to a new exercise in the same micro lesson, named
--    "<name> (2)", "<name> (3)", ... Kept in exercise_split_log for audit.
CREATE TABLE IF NOT EXISTS exercise_split_log (
  question_id bigint PRIMARY KEY,
  old_exercise_id bigint NOT NULL,
  new_exercise_id bigint NOT NULL,
  new_name character varying NOT NULL,
  created_at timestamp(6) without time zone NOT NULL DEFAULT now()
);

DO $$
DECLARE
  r record;
  new_id bigint;
  new_name text;
BEGIN
  FOR r IN
    SELECT q.id AS question_id, q.assessment_id, n.rank, a.*
    FROM (SELECT id, assessment_id, row_number() OVER (PARTITION BY assessment_id ORDER BY id) AS rank
          FROM bx_block_assessmenttest_questionbanks) n
    JOIN bx_block_assessmenttest_questionbanks q ON q.id = n.id
    JOIN bx_block_assessmenttest_assessments a ON a.id = q.assessment_id
    WHERE n.rank > 1
    ORDER BY q.id
  LOOP
    new_name := r.name || ' (' || r.rank || ')';
    IF EXISTS (SELECT 1 FROM bx_block_assessmenttest_assessments
               WHERE micro_lesson_id = r.micro_lesson_id AND lower(name) = lower(new_name)) THEN
      new_name := r.name || ' (question ' || r.question_id || ')';
    END IF;
    INSERT INTO bx_block_assessmenttest_assessments
      (name, created_at, updated_at, lesson_id, micro_lesson_id, category_type, category_id,
       sub_category_id, course_id, main_id, unit_id, country_id, is_aha)
    VALUES
      (new_name, r.created_at, now(), r.lesson_id, r.micro_lesson_id, r.category_type, r.category_id,
       r.sub_category_id, r.course_id, r.main_id, r.unit_id, r.country_id, r.is_aha)
    RETURNING id INTO new_id;
    UPDATE bx_block_assessmenttest_questionbanks SET assessment_id = new_id WHERE id = r.question_id;
    INSERT INTO exercise_split_log (question_id, old_exercise_id, new_exercise_id, new_name)
    VALUES (r.question_id, r.assessment_id, new_id, new_name);
  END LOOP;
END $$;

-- Answers stored with both ids follow their question to its new exercise.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['bx_block_educational_gamification_question_and_answers', 'share_records'] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t AND column_name = 'assessment_id')
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t AND column_name = 'question_bank_id') THEN
      EXECUTE format('UPDATE %I x SET assessment_id = s.new_exercise_id FROM exercise_split_log s WHERE x.question_bank_id = s.question_id', t);
    END IF;
  END LOOP;
END $$;

-- 2. The merged table. id = old exercise id, question_id = old question id (answer options,
--    option groups, variables, images and translations still point at question_id).
CREATE TABLE exercises (
  id bigint PRIMARY KEY,
  micro_lesson_id bigint NOT NULL,
  name character varying NOT NULL,
  category_type integer NOT NULL,
  is_aha boolean DEFAULT false,
  -- shortcuts to the micro lesson's parents, kept for the Rails app
  lesson_id bigint NOT NULL,
  unit_id bigint NOT NULL,
  main_id bigint NOT NULL,
  course_id bigint NOT NULL,
  sub_category_id bigint NOT NULL,
  category_id bigint NOT NULL,
  country_id bigint NOT NULL,
  -- the question (empty while an exercise has no question yet)
  question_id bigint UNIQUE,
  question_type integer,
  questionbank_type character varying,
  question character varying,
  question_body character varying,
  hint character varying,
  solution character varying,
  question_created_at timestamp(6) without time zone,
  question_updated_at timestamp(6) without time zone,
  created_at timestamp(6) without time zone NOT NULL,
  updated_at timestamp(6) without time zone NOT NULL,
  CONSTRAINT exercises_question_complete CHECK (
    question_id IS NULL OR (question_type IS NOT NULL AND questionbank_type IS NOT NULL AND question IS NOT NULL
      AND hint IS NOT NULL AND solution IS NOT NULL AND question_created_at IS NOT NULL AND question_updated_at IS NOT NULL))
);

INSERT INTO exercises
  (id, micro_lesson_id, name, category_type, is_aha, lesson_id, unit_id, main_id, course_id, sub_category_id,
   category_id, country_id, question_id, question_type, questionbank_type, question, question_body, hint, solution,
   question_created_at, question_updated_at, created_at, updated_at)
SELECT a.id, a.micro_lesson_id, a.name, a.category_type, a.is_aha, a.lesson_id, a.unit_id, a.main_id, a.course_id,
       a.sub_category_id, a.category_id, a.country_id, q.id, q.question_type, q.questionbank_type, q.question,
       q.question_body, q.hint, q.solution, q.created_at, q.updated_at, a.created_at, a.updated_at
FROM bx_block_assessmenttest_assessments a
LEFT JOIN bx_block_assessmenttest_questionbanks q ON q.assessment_id = a.id;

DO $$
DECLARE orphans int;
BEGIN
  SELECT count(*) INTO orphans FROM bx_block_assessmenttest_questionbanks q
  WHERE NOT EXISTS (SELECT 1 FROM bx_block_assessmenttest_assessments a WHERE a.id = q.assessment_id);
  IF orphans > 0 THEN
    RAISE EXCEPTION '% question(s) point at an exercise that does not exist; fix them first', orphans;
  END IF;
  IF (SELECT count(*) FROM exercises) <> (SELECT count(*) FROM bx_block_assessmenttest_assessments)
     OR (SELECT count(*) FROM exercises WHERE question_id IS NOT NULL) <> (SELECT count(*) FROM bx_block_assessmenttest_questionbanks) THEN
    RAISE EXCEPTION 'Row counts do not match after the copy';
  END IF;
END $$;

CREATE UNIQUE INDEX index_exercises_on_name_and_micro_lesson_id ON exercises (name, micro_lesson_id);
CREATE INDEX index_exercises_on_micro_lesson_id ON exercises (micro_lesson_id);
CREATE INDEX index_exercises_on_lesson_id ON exercises (lesson_id);
CREATE INDEX index_exercises_on_unit_id ON exercises (unit_id);
CREATE INDEX index_exercises_on_main_id ON exercises (main_id);
CREATE INDEX index_exercises_on_question_type ON exercises (question_type);

-- 3. Keep the old tables as *_legacy (read-only backup, for down.sql); hand their id sequences to exercises.
ALTER TABLE bx_block_assessmenttest_assessments RENAME TO bx_block_assessmenttest_assessments_legacy;
ALTER TABLE bx_block_assessmenttest_questionbanks RENAME TO bx_block_assessmenttest_questionbanks_legacy;
ALTER TABLE bx_block_assessmenttest_assessments_legacy ALTER COLUMN id DROP DEFAULT;
ALTER TABLE bx_block_assessmenttest_questionbanks_legacy ALTER COLUMN id DROP DEFAULT;
ALTER SEQUENCE bx_block_assessmenttest_assessments_id_seq RENAME TO exercises_id_seq;
ALTER SEQUENCE bx_block_assessmenttest_questionbanks_id_seq RENAME TO exercises_question_id_seq;
ALTER SEQUENCE exercises_id_seq OWNED BY exercises.id;
ALTER SEQUENCE exercises_question_id_seq OWNED BY exercises.question_id;
ALTER TABLE exercises ALTER COLUMN id SET DEFAULT nextval('exercises_id_seq');
SELECT setval('exercises_id_seq', GREATEST((SELECT max(id) FROM exercises), 1));
SELECT setval('exercises_question_id_seq', GREATEST((SELECT max(question_id) FROM exercises), (SELECT last_value FROM exercises_question_id_seq), 1));

-- Foreign keys that pointed at the old tables now point at exercises.
DO $$
DECLARE c record; target text;
BEGIN
  FOR c IN
    SELECT con.conname, con.conrelid::regclass AS child, con.confrelid::regclass::text AS parent,
           (SELECT string_agg(quote_ident(attname), ', ') FROM pg_attribute WHERE attrelid = con.conrelid AND attnum = ANY (con.conkey)) AS cols
    FROM pg_constraint con
    WHERE con.contype = 'f'
      AND con.confrelid IN ('bx_block_assessmenttest_assessments_legacy'::regclass, 'bx_block_assessmenttest_questionbanks_legacy'::regclass)
      AND con.conrelid NOT IN ('bx_block_assessmenttest_assessments_legacy'::regclass, 'bx_block_assessmenttest_questionbanks_legacy'::regclass)
  LOOP
    target := CASE WHEN c.parent = 'bx_block_assessmenttest_assessments_legacy' THEN 'exercises (id)' ELSE 'exercises (question_id)' END;
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', c.child, c.conname);
    EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (%s) REFERENCES %s', c.child, c.conname, c.cols, target);
    RAISE NOTICE 'Foreign key %.% now references %', c.child, c.conname, target;
  END LOOP;
END $$;

-- 4. Old names as views. Same columns as the old tables.
CREATE VIEW bx_block_assessmenttest_assessments AS
SELECT id, name, created_at, updated_at, lesson_id, micro_lesson_id, category_type, category_id, sub_category_id,
       course_id, main_id, unit_id, country_id, is_aha
FROM exercises;
-- Simple view: Postgres writes INSERT / UPDATE / DELETE straight through to exercises.
ALTER VIEW bx_block_assessmenttest_assessments ALTER COLUMN id SET DEFAULT nextval('exercises_id_seq');
ALTER VIEW bx_block_assessmenttest_assessments ALTER COLUMN is_aha SET DEFAULT false;

CREATE VIEW bx_block_assessmenttest_questionbanks AS
SELECT question_id AS id, id AS assessment_id, question_created_at AS created_at, question_updated_at AS updated_at,
       question, question_body, solution, hint, question_type, questionbank_type
FROM exercises
WHERE question_id IS NOT NULL;

-- A question is the question part of its exercise row: adding one fills that part, deleting one empties it.
CREATE FUNCTION questionbanks_view_write() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE n int;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.id := COALESCE(NEW.id, nextval('exercises_question_id_seq'));
    NEW.created_at := COALESCE(NEW.created_at, now());
    NEW.updated_at := COALESCE(NEW.updated_at, now());
    UPDATE exercises SET question_id = NEW.id, question_type = NEW.question_type, questionbank_type = NEW.questionbank_type,
           question = NEW.question, question_body = NEW.question_body, hint = NEW.hint, solution = NEW.solution,
           question_created_at = NEW.created_at, question_updated_at = NEW.updated_at
    WHERE id = NEW.assessment_id AND question_id IS NULL;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n = 0 THEN
      IF EXISTS (SELECT 1 FROM exercises WHERE id = NEW.assessment_id) THEN
        RAISE EXCEPTION 'Exercise % already has a question: an exercise holds exactly one question', NEW.assessment_id USING ERRCODE = '23505';
      END IF;
      RAISE EXCEPTION 'Exercise % does not exist', NEW.assessment_id USING ERRCODE = '23503';
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.assessment_id IS DISTINCT FROM OLD.assessment_id THEN
      RAISE EXCEPTION 'A question cannot change its id or move to another exercise' USING ERRCODE = '23514';
    END IF;
    UPDATE exercises SET question_type = NEW.question_type, questionbank_type = NEW.questionbank_type,
           question = NEW.question, question_body = NEW.question_body, hint = NEW.hint, solution = NEW.solution,
           question_created_at = NEW.created_at, question_updated_at = NEW.updated_at
    WHERE question_id = OLD.id;
    RETURN NEW;
  ELSE
    UPDATE exercises SET question_id = NULL, question_type = NULL, questionbank_type = NULL, question = NULL,
           question_body = NULL, hint = NULL, solution = NULL, question_created_at = NULL, question_updated_at = NULL
    WHERE question_id = OLD.id;
    RETURN OLD;
  END IF;
END $$;

CREATE TRIGGER questionbanks_view_write INSTEAD OF INSERT OR UPDATE OR DELETE ON bx_block_assessmenttest_questionbanks
FOR EACH ROW EXECUTE FUNCTION questionbanks_view_write();

COMMENT ON TABLE exercises IS 'One row per exercise, holding its question (change 001). Old names bx_block_assessmenttest_assessments / _questionbanks are views over it.';

COMMIT;
