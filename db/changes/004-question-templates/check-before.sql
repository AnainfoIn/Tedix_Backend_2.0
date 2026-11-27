-- 004 Read-only check before up.sql: 001 must be applied, and no exercise is a template yet.
SELECT to_regclass('public.exercises') IS NOT NULL AS exercises_table_exists;
SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'exercises' AND column_name = 'question_template') AS already_applied;
-- Questions already marked 'template' in Rails (they have no placeholders the 2.0 API can fill; listed for information).
SELECT questionbank_type, count(*) FROM exercises WHERE question_id IS NOT NULL GROUP BY 1 ORDER BY 1;
