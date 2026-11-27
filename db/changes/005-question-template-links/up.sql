-- 005 Question template links (needs 001), for generateQuestion Part B
--
-- question_template_links  links a template exercise (one with {{a}} placeholders and variables,
--                          made by Part A or in the editor) to a micro lesson quiz. One template can
--                          feed many quizzes; each time the quiz is opened, the template gives new
--                          numbers. The template itself stays an exercise of its own micro lesson.
--   exercise_id      the template exercise
--   micro_lesson_id  the quiz that uses it
--   position         order among the linked templates of that quiz (after the quiz's own exercises)
--   question_count   how many generated questions the quiz takes from it (1 to 50)
-- New table only: Rails and the student app do not see it.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f up.sql

BEGIN;
SET LOCAL lock_timeout = '10s';

DO $$
BEGIN
  IF to_regclass('public.exercises') IS NULL THEN
    RAISE EXCEPTION 'Apply change 001 (exercises) first';
  END IF;
  IF to_regclass('public.question_template_links') IS NOT NULL THEN
    RAISE EXCEPTION 'question_template_links already exists: change 005 was already applied';
  END IF;
END $$;

CREATE TABLE question_template_links (
  id bigserial PRIMARY KEY,
  exercise_id bigint NOT NULL REFERENCES exercises (id) ON DELETE CASCADE,
  micro_lesson_id bigint NOT NULL REFERENCES bx_block_profile_micro_lessons (id) ON DELETE CASCADE,
  position integer NOT NULL,
  question_count integer NOT NULL DEFAULT 1 CHECK (question_count BETWEEN 1 AND 50),
  created_at timestamp(6) without time zone NOT NULL DEFAULT now(),
  updated_at timestamp(6) without time zone NOT NULL DEFAULT now(),
  CONSTRAINT question_template_links_once UNIQUE (micro_lesson_id, exercise_id)
);
CREATE INDEX index_question_template_links_on_exercise_id ON question_template_links (exercise_id);
CREATE INDEX index_question_template_links_on_micro_lesson_id_and_position ON question_template_links (micro_lesson_id, position);

COMMIT;
