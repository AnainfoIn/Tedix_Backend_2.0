# Database change log

Every change made to the shared Postgres database (dev first, then prod) is listed here, in the
order it must be applied. Each change has its own folder under `db/changes/<nnn>-<name>/` with:

- `check-before.sql`: read-only, run first and read the output
- `up.sql`: the change, in one transaction (all or nothing)
- `down.sql`: the undo

Run them with psql against the target database:

```sh
psql "$DATABASE_URL" -f db/changes/<nnn>-<name>/check-before.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/changes/<nnn>-<name>/up.sql
```

Always take a backup first (`pg_dump --format=custom --file=before-<nnn>.dump "$DATABASE_URL"`).

| # | Change | Dev | Prod |
| --- | --- | --- | --- |
| 001 | Merge questions into exercises | not applied yet | not applied yet |
| 002 | Exercise translations (multilanguage) | not applied yet | not applied yet |

When a change is applied, write the date in the table above.

---

## 001 Merge questions into exercises

**Why.** An exercise (`bx_block_assessmenttest_assessments`) held only its name, micro lesson and
flags. Its content (question, body, hint, solution, type) lived in a separate question table
(`bx_block_assessmenttest_questionbanks`), almost always one question per exercise. Now one table,
`exercises`, holds both.

**Structure after the change:** [db-structure/exercises.mmd](db-structure/exercises.mmd)
(picture: [db-structure/exercises.png](db-structure/exercises.png)).

### What `up.sql` does

1. **Splits exercises that have more than one question.** The lowest question id stays on the
   exercise. Each other question moves to a new exercise in the same micro lesson, named
   `<name> (2)`, `<name> (3)`, ... (or `<name> (question <id>)` if that name is taken). Every move
   is recorded in the new table `exercise_split_log`. Student answers in
   `bx_block_educational_gamification_question_and_answers` and `share_records` (when they still
   have both ids) follow their question to the new exercise. Exercise attempts
   (`bx_block_assessmenttest_attempted_assessments`) stay on the original exercise.
2. **Creates `exercises`** and copies every exercise with its question into it. `exercises.id` is the
   old exercise id and `exercises.question_id` is the old question id, so no other table needs new
   ids. Stops if any question points at a missing exercise, or if the row counts do not match.
3. **Keeps the old tables as `bx_block_assessmenttest_assessments_legacy` and
   `bx_block_assessmenttest_questionbanks_legacy`** (a frozen backup), and moves their id sequences
   to `exercises` (renamed `exercises_id_seq` and `exercises_question_id_seq`). Any foreign key that
   pointed at the old tables is re-pointed at `exercises`.
4. **Creates two views with the old names**, so the Rails API, ActiveAdmin, the student app and
   the 2.0 admin keep working unchanged, with the same columns and ids:
   - `bx_block_assessmenttest_assessments`: the exercise columns. Inserts, updates and deletes go
     straight to `exercises`.
   - `bx_block_assessmenttest_questionbanks`: the question columns of exercises that have one.
     A trigger maps writes: insert fills the question part of the exercise row (refused if the
     exercise already has a question), update changes it (it cannot move a question to another
     exercise), delete empties it.

Running `up.sql` twice is refused ("exercises already exists").

### Order of steps (dev, then the same on prod)

1. **Deploy the Rails change first** (Tedix_Backend: `self.primary_key = :id` on
   `BxBlockAssessmenttest::Assessment` and `::Questionbank`). Rails cannot read a view's primary
   key, and without this line every exercise lookup fails with `UnknownPrimaryKey`. The line
   changes nothing while the tables are still tables, so it is safe to deploy any time before.
2. Take a backup (`pg_dump`, see above).
3. Run `check-before.sql` and read it: how many exercises will be split and their new names,
   orphan questions (must be 0), foreign keys and views on the two tables.
4. Run `up.sql`. It takes a short exclusive lock on the two tables (seconds for a few thousand rows).
5. Check: open a micro lesson in the 2.0 admin and in the student app; the exercises and questions
   look the same (plus the split ones).
6. Write the date in the table at the top of this file.

The 2.0 backend needs no deploy for this change: it keeps using the old names, which work before
and after.

### Undo

`down.sql` puts back the two tables with whatever is in `exercises` at that moment (edits made
after the change are kept), restores sequences and foreign keys, and drops `exercises`. The split
of multi-question exercises is not undone; `exercise_split_log` lists it.

### Things to know after the change

- **One question per exercise.** Adding a second question to an exercise (for example with "Add
  Question Bank" in ActiveAdmin) is refused with "Exercise N already has a question". Create a new
  exercise instead.
- **Schema changes to these two names** (new columns, indexes) must now be made on `exercises`,
  and the views recreated to show the new column. A Rails migration that runs `add_column` on
  `bx_block_assessmenttest_questionbanks` would fail on the view.
- `rails db:migrate` rewrites `db/schema.rb` without the two views (Rails does not dump views).
  This only matters for `db:schema:load` on a fresh test database.
- The `*_legacy` tables can be dropped once prod has run on the merged table without problems for
  a while, and the 2.0 code can then switch from the old names to `exercises` directly.

### How it was tested

On a local Postgres 16 with the June 2025 dump (635 exercises, 649 questions; 624 with one
question, 10 with two or three, 1 with none), brought up to the current Rails columns:

- after `up.sql`: 650 exercises (15 created by the split), 649 with a question; every row of the
  question view equals its row in the legacy copy; answers follow their moved question
- Rails 6.1 ActiveRecord against the views: without the primary-key line, `find` fails with
  `UnknownPrimaryKey`; with it, find, create, update and destroy of exercises and questions all work
- the question-view trigger refuses a second question and moving a question; foreign keys stay enforced
- `down.sql`, then `up.sql` again, both succeed; a third run of `up.sql` is refused
- 2.0 API e2e tests pass on the old schema and with `TEST_DB_CHANGES=1` (schema plus every
  `db/changes/*/up.sql`), including the exercise editor save and delete

---

## 002 Exercise translations (multilanguage)

Needs 001. Follows the exercise editor design: each exercise is written in one original language,
and every other language has its own name, question, body, hint, solution and answer options,
each with a status (auto, edited, reviewed; no value = missing).

**Why.** Until now these translations were rows of the generic `admin_content_translations`
table (one row per item, field and language, shared with micro lessons and curriculum levels).
Exercises now get their own typed tables.

**Structure:** same diagram as 001, [db-structure/exercises.mmd](db-structure/exercises.mmd).

### What `up.sql` does

1. Adds `exercises.original_language_id` (the language the exercise is written in; NULL = the
   same as its micro lesson, which is how the admin works today). Filled from
   `admin_content_languages` rows of type `exercise`, which are then removed.
2. Creates `exercise_translations`, one row per exercise and language: `name`, `question`,
   `question_body`, `hint`, `solution`, plus `status` and `source_hash` as JSON keyed by field
   (`name`, `question`, `questionBody`, `hint`, `solution`). Deleting the exercise deletes its
   translations; when an exercise loses its question, the question's translated fields are cleared.
3. Creates `exercise_option_translations`, one row per answer option and language. Deleting the
   option deletes its translations.
4. Moves every `exercise`, `question` and `option` row of `admin_content_translations` into
   the new tables (question rows land on the exercise that holds that question, including the
   exercises split by 001), checks the counts, then removes the moved rows. Rows whose exercise,
   question, option or language no longer exists stay where they are. Micro lesson and
   curriculum level translations are not touched.

Rails and the student app do not read translations, so nothing changes for them. Running
`up.sql` twice is refused.

### Order of steps

1. Change 001 is applied.
2. Backup, then `up.sql`.
3. Check: open a micro lesson's language tabs in the 2.0 admin; the exercise, question and option
   translations show as before.

The 2.0 backend picks the new tables up by itself (it checks whether they exist), so the code can be
deployed before or after this change.

### Undo

`down.sql` copies the rows back into `admin_content_translations` / `admin_content_languages`
and drops the two tables and the column.

### Things to know

- `updated_by` is kept per exercise and language, not per field.
- The student app still shows exercises in their original language: serving the translations
  to the app is a later step of the Node API.

### How it was tested

On the same local copy after 001, with sample translations (names, question fields in two
languages, an option, plus an orphan row, a row in an unknown language and a micro lesson row):
the right rows moved (including a question that 001 moved to a split exercise), orphans and micro
lesson rows stayed, statuses and hashes kept per field; removing a question cleared its fields;
deleting the exercise removed its row; `down.sql` restored the original rows exactly; `up.sql`
again worked and a second run was refused. The 2.0 e2e tests save, clear and read back exercise,
question and option translations on both schemas.
