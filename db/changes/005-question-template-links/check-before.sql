-- 005 Read-only check before up.sql.
--   psql "$DATABASE_URL" -f check-before.sql
SELECT to_regclass('public.exercises') IS NOT NULL AS has_001_exercises,
       to_regclass('public.question_template_links') IS NOT NULL AS already_applied;
-- Template exercises that could be linked (questionbank_type template, or with variables).
SELECT count(DISTINCT q.id) AS template_exercises
FROM bx_block_assessmenttest_questionbanks q
LEFT JOIN bx_block_assessmenttest_variables v ON v.questionbank_id = q.id
WHERE q.questionbank_type = 'template' OR v.id IS NOT NULL;
