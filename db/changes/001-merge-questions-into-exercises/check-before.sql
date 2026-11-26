-- 001 Read-only check to run before up.sql. Changes nothing.
--   psql "$DATABASE_URL" -f check-before.sql

-- How many questions each exercise has (1 is the normal case; 2+ get split by up.sql).
SELECT questions_per_exercise, count(*) AS exercises
FROM (SELECT a.id, count(q.id) AS questions_per_exercise
      FROM bx_block_assessmenttest_assessments a
      LEFT JOIN bx_block_assessmenttest_questionbanks q ON q.assessment_id = a.id
      GROUP BY a.id) t
GROUP BY 1 ORDER BY 1;

-- Exercises that will be split, with the new names they will get.
SELECT a.id AS exercise_id, a.micro_lesson_id, a.name, q.id AS question_id, n.rank,
       CASE WHEN n.rank = 1 THEN '(stays)' ELSE a.name || ' (' || n.rank || ')' END AS exercise_after
FROM (SELECT id, assessment_id, row_number() OVER (PARTITION BY assessment_id ORDER BY id) AS rank
      FROM bx_block_assessmenttest_questionbanks) n
JOIN bx_block_assessmenttest_questionbanks q ON q.id = n.id
JOIN bx_block_assessmenttest_assessments a ON a.id = q.assessment_id
WHERE a.id IN (SELECT assessment_id FROM bx_block_assessmenttest_questionbanks GROUP BY 1 HAVING count(*) > 1)
ORDER BY a.id, n.rank;

-- Questions whose exercise is missing (must be 0, or up.sql stops).
SELECT count(*) AS orphan_questions FROM bx_block_assessmenttest_questionbanks q
WHERE NOT EXISTS (SELECT 1 FROM bx_block_assessmenttest_assessments a WHERE a.id = q.assessment_id);

-- Foreign keys pointing at the two tables (up.sql re-points them at exercises).
SELECT conrelid::regclass AS child_table, conname, confrelid::regclass AS parent_table
FROM pg_constraint
WHERE contype = 'f' AND confrelid IN ('bx_block_assessmenttest_assessments'::regclass, 'bx_block_assessmenttest_questionbanks'::regclass);

-- Views or rules that depend on the two tables (must be none, or up.sql cannot rename them).
SELECT DISTINCT v.relname AS dependent_view
FROM pg_depend d JOIN pg_rewrite r ON r.oid = d.objid JOIN pg_class v ON v.oid = r.ev_class
WHERE d.refobjid IN ('bx_block_assessmenttest_assessments'::regclass, 'bx_block_assessmenttest_questionbanks'::regclass)
  AND v.oid NOT IN ('bx_block_assessmenttest_assessments'::regclass, 'bx_block_assessmenttest_questionbanks'::regclass);
