-- 003 Exercise order and "Check type" flag (needs 001), for the exercise list design
--
-- exercises.position      order of the exercises inside their micro lesson (drag to reorder in the admin)
-- exercises.needs_review  "Check type" tag: the exercise came from old data whose type the new
--                         editor can only guess, or it was split out of another exercise by 001.
--                         Saving the exercise in the editor clears it.
-- exercises.review_note   why it needs a check
-- Rails and the student app do not see these columns (the old-name views leave them out).
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f up.sql

BEGIN;
SET LOCAL lock_timeout = '10s';

DO $$
BEGIN
  IF to_regclass('public.exercises') IS NULL THEN
    RAISE EXCEPTION 'Apply change 001 (exercises) first';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'exercises' AND column_name = 'position') THEN
    RAISE EXCEPTION 'exercises.position already exists: change 003 was already applied';
  END IF;
END $$;

-- 1. Order: today's order is by id, so number them that way per micro lesson.
ALTER TABLE exercises ADD COLUMN position integer;
UPDATE exercises e SET position = n.rn
FROM (SELECT id, row_number() OVER (PARTITION BY micro_lesson_id ORDER BY id) AS rn FROM exercises) n
WHERE n.id = e.id;
ALTER TABLE exercises ALTER COLUMN position SET NOT NULL;
CREATE INDEX index_exercises_on_micro_lesson_id_and_position ON exercises (micro_lesson_id, position);

-- A new exercise (from Rails or the admin) goes to the end of its micro lesson.
CREATE FUNCTION exercises_default_position() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.position IS NULL THEN
    SELECT COALESCE(max(position), 0) + 1 INTO NEW.position FROM exercises WHERE micro_lesson_id = NEW.micro_lesson_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER exercises_default_position BEFORE INSERT ON exercises
FOR EACH ROW EXECUTE FUNCTION exercises_default_position();

-- 2. "Check type".
ALTER TABLE exercises ADD COLUMN needs_review boolean NOT NULL DEFAULT false;
ALTER TABLE exercises ADD COLUMN review_note character varying;

-- Old MCQ (0) and Challenge (1) questions open as Multiple Choice in the editor: check whether
-- they are really Single or Multiple Choice.
UPDATE exercises SET needs_review = true,
       review_note = 'Was ' || CASE question_type WHEN 0 THEN 'MCQ' ELSE 'Challenge' END || ' in the old admin: check it is the right type (Single or Multiple Choice)'
WHERE question_type IN (0, 1);

-- Exercises that 001 split out of an exercise with several questions.
DO $$
BEGIN
  IF to_regclass('public.exercise_split_log') IS NOT NULL THEN
    UPDATE exercises e SET needs_review = true,
           review_note = COALESCE(e.review_note || '. ', '') || 'Split out of "' || o.name || '" (it had several questions): check the name and type'
    FROM exercise_split_log s JOIN exercises o ON o.id = s.old_exercise_id
    WHERE e.id = s.new_exercise_id;
  END IF;
END $$;

COMMIT;
