# generateQuestion

Turns example exercises such as `2+3=5` into templates, saves them as exercises, and serves them with
new random numbers each time they are opened (for example in a quiz).

**No database change.** Templates are stored the way the Rails app already stores them:

| What | Where |
| --- | --- |
| Exercise marked as a template | `bx_block_assessmenttest_questionbanks.questionbank_type = 'template'` |
| Question, body, hint, solution with `{{a}}` placeholders | the exercise's normal text columns |
| Answer tiles/options with `{{c}}`, `{{c + 1}}` | `bx_block_assessmenttest_answer_options` (in `answer_option_groups`) |
| Variables (range or formula) | `bx_block_assessmenttest_variables` (`name`, `value_type`, `min_val`, `max_val`, `formula`) |

So the editor, the Rails app and the existing 1,134 templates all keep working, and Part B also serves
those existing templates.

## Part A: examples to templates

`2+3=5` becomes the pattern `{{a}} + {{b}} = {{c}}`:

- `a` and `b` are random integers, with a range taken from the example's numbers (1..9 for one digit,
  10..99 for two digits; override with `ranges`).
- `c` is a formula variable, `a + b`. A formula variable's min/max act as a filter (here `c >= 1`).
- The type decides the shape:
  - Fill in the Blank (default): body `{{a}} + {{b}} = [Blank]`, tiles `{{c}}` (correct), `{{c + 1}}`, `{{c - 1}}`.
  - Single choice: options `{{c}}`, `{{c - 1}}`, `{{c + 1}}`, `{{c + 2}}`, shuffled.
  - Number pattern (`2, 4, 6, ?`, `3, 6, 12, 24`): variables `s` and `d` (adding) or `s` and `r` (multiplying).
- `12 : 3 = 4` is built as `a = b * c`, so divisions are always exact.
- `12 - ? = 7` hides the `?` number.
- Typed templates work too: `{a} * {b} = {c}` or `{{a}}+{{b}}={{c}}`.
- Conditions (`constraints: ["a - b <= 3"]`) are stored as formula variables `cond1`, ... with min 1 and max 1.
- Several examples of the same shape become one template; examples that are wrong (`2+3=6`) or not
  arithmetic are reported under `skipped`.

## Part B: serve a template with new numbers

For any exercise with variables: pick random values in range, compute formulas, keep the values that
pass every filter, fill all `{{...}}` placeholders and options, and skip duplicates. A `seed` gives the
same questions again. Exercises without variables are returned as written, with `generated: false`.

Placeholders can be expressions (`{{a + b}}`, `{{2a}}`, `{{ae-bd}}`) and existing names such as `3a`,
`max` or `dist_d1d2` are read as the data has them. Formulas support `+ - * / % ^ **`, brackets,
comparisons and `min max abs round floor ceil sqrt`. There is no `eval`.

Results on a local copy of dev: 1,134 of 1,467 exercises with variables generate. The others have data
errors (a missing brace, `2<em>a`, a variable without a range, formulas that depend on each other); see
`existing-templates-check.csv` in the project files. Templates made by Part A are checked strictly
before they are saved.

## API (admin, `/admin/api/workspace`)

| Method | Path | Permission | Does |
| --- | --- | --- | --- |
| POST | `question-templates/preview` | read micro_lessons | Part A without saving: templates and sample questions |
| POST | `question-templates/generate` | read micro_lessons | Questions from examples or a template, nothing saved |
| POST | `question-templates` | manage micro_lessons | Part A and save (`microLessonId` for new exercises, or `exerciseId` to turn one into a template) |
| GET | `exercises/:id/template` | read micro_lessons | The exercise as a template, with any problems |
| GET | `exercises/:id/questions?count=15&seed=` | read micro_lessons | Part B: `count` questions with answers (max 200) |
| GET | `micro_lessons/:id/quiz?seed=` | read micro_lessons | One question per exercise, in order, freshly generated |

Request body for Part A:

```json
{
  "examples": ["2+3=5", "7+1=8"],
  "type": "fill_in_the_blank",
  "ranges": { "a": [1, 20] },
  "constraints": ["a > b"],
  "count": 15,
  "microLessonId": 12
}
```

## MCP server

```bash
TEDIX_API_URL=http://localhost:4000 TEDIX_ADMIN_EMAIL=you@example.com TEDIX_ADMIN_PASSWORD='...' npm run mcp
```

Or set `TEDIX_ADMIN_TOKEN`. Admins with 2FA also need `TEDIX_ADMIN_OTP_SECRET`. Claude Desktop config:

```json
{ "mcpServers": { "tedix-generate-question": {
  "command": "npm", "args": ["run", "--silent", "mcp"], "cwd": "/path/to/Tedix_Backend_2.0",
  "env": { "TEDIX_API_URL": "http://localhost:4000", "TEDIX_ADMIN_TOKEN": "..." } } } }
```

Tools:

- `preview_question_templates`: Part A, runs locally, saves nothing.
- `save_question_templates`: Part A and save through the API.
- `generate_questions`: with `exerciseId`, Part B through the API; with examples, locally.
- `quiz_micro_lesson`: a freshly generated quiz for a micro lesson.
- `find_micro_lessons`: search micro lessons by name, to get an id.
- `get_exercise_template`: show an exercise's template and variables.

## Code

`apps/api/src/generate-question/`: `expression.ts` (formula parser), `template.ts` (compile, check,
generate), `detect.ts` (Part A), `requests.ts`, the service and controller, and `mcp-server.ts`.
Tests: `generate-question.spec.ts` and the generateQuestion block in `test/records.e2e-spec.ts`.
