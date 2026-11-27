# generateQuestion: exercises from examples, with new numbers every time

Give it example exercises such as `2+3=5`. It works out the exercise type and the template
(`{a} + {b} = {c}`), the number ranges, and saves it as an exercise of a micro lesson. Every time
the exercise is served, it is filled with new random numbers, with the right answer.

Code: `apps/api/src/generate-question/`. Database: change 004 (`exercises.question_template`, see
[DB_CHANGES.md](DB_CHANGES.md)).

## What it understands

| Example | Becomes | Exercise type |
| --- | --- | --- |
| `2+3=5` | `{a} + {b} = [Blank]`, answer `{c}`, c = a + b | Fill in the Blank (3) |
| `12 - ? = 7` | `{a} - [Blank] = {c}`, answer `{b}` | Fill in the Blank |
| `12 : 3 = 4` | made as a = b × c, so it always divides exactly | Fill in the Blank |
| `3 × 4 = 12` with `type: single_choice` | `{a} \times {b} = ?`, options c, c−1, c+1, c+2 (shuffled) | Single Choice (2) |
| `(2 + 3) × 4 = 20`, `2^3 = 8`, `1.5 + 2.25 = 3.75` | any arithmetic with + − × ÷ : ^ and brackets, decimals | Fill in the Blank |
| `2, 4, 6, ?` / `3, 6, 12, 24` | adding or multiplying pattern, hidden term = the `?` (or the last) | Number Pattern (10) |
| `{a}+{b}={c}` or `{{a}+{b}={c}}` | a template typed directly | as above |

- **Ranges come from the examples**: `2` gives 1 to 9, `25` gives 10 to 99. Several examples of
  the same shape widen them (`7+8=15` and `25+17=42` give 1 to 99). Override with `ranges`, e.g.
  `{"a": [1, 20], "c": {"max": 20}}` (on the result it is a condition).
- **Safe answers by default**: no negative results unless an example had one; divisions are
  exact; `constraints` adds more, e.g. `["a > b", "c <= 10"]`.
- **One template per shape**: `2+3=5`, `7+1=8` and `9-4=5` give two templates (addition,
  subtraction). Wrong examples (`2+3=6`) are left out and reported.
- Texts are short English LaTeX texts like the existing exercises ("Fill in the blank.", a hint,
  the solution `{a} + {b} = {c}`). Give your own with `texts` (they can use `{a}` placeholders).

## How it is stored

`exercises.question_template` holds the exercise in the editor's format for its type (question,
body, hint, solution, option groups with `is_correct` / `sequence_number`) with placeholders, and
the variables:

```json
{
  "version": 1, "questionType": 3, "pattern": "{a} + {b} = {c}", "examples": ["2+3=5"],
  "question": "\\text{Fill in the blank.}", "questionBody": "{a} + {b} = [Blank]",
  "hint": "\\text{Add the numbers.}", "solution": "{a} + {b} = {c}",
  "groups": [{ "shapeType": null, "options": [
    { "option": "{c}", "isCorrect": true, "sequenceNumber": 1 },
    { "option": "{c + 1}", "isCorrect": false, "sequenceNumber": null },
    { "option": "{c - 1}", "isCorrect": false, "sequenceNumber": null } ] }],
  "variables": [
    { "name": "a", "type": "integer", "min": 1, "max": 9 },
    { "name": "b", "type": "integer", "min": 1, "max": 9 },
    { "name": "c", "type": "integer", "formula": "a + b", "min": 0 } ],
  "constraints": ["c >= 1"]
}
```

The normal columns keep the first example filled in (`2 + 3 = [Blank]`, tile `5`), marked
`questionbank_type = 'template'`, so Rails and the student app keep showing a valid question.

## API (admin, `/admin/api/workspace`)

| Call | What it does |
| --- | --- |
| `POST question-templates/preview` `{examples, type?, ranges?, constraints?, texts?, count?}` | templates with sample questions, saves nothing |
| `POST question-templates/generate` `{examples or template, count?, seed?}` | N questions with answers, saves nothing |
| `POST question-templates` `{examples or template, microLessonId or exerciseId, name?, isAha?, ...}` | saves one exercise per template (or into one existing exercise) |
| `GET exercises/:id/variants?count=15&seed=` | N new questions of a template exercise, with answers |
| `GET exercises/:id/template` / `DELETE exercises/:id/template` | read it / turn it back into a normal exercise |

Reading needs `read` on micro lessons, saving needs `manage` (same roles as the exercise editor).

## MCP server

`apps/api/src/generate-question/mcp-server.ts`, over stdio. Tools:

- `preview_question_templates`: examples in, templates and sample questions out (works without the API)
- `save_question_templates`: saves into a micro lesson (`microLessonId`) or an exercise (`exerciseId`)
- `generate_questions`: e.g. 15 questions with answers, from a saved exercise or straight from examples
- `find_micro_lessons`: micro lesson ids by name
- `get_exercise_template`: what is saved on an exercise

Saving and reading saved exercises go through the admin API with an admin account:

| Variable | |
| --- | --- |
| `TEDIX_API_URL` | the 2.0 API, e.g. `http://localhost:4000` or the dev server |
| `TEDIX_ADMIN_TOKEN` | a signed-in admin token, or instead: |
| `TEDIX_ADMIN_EMAIL`, `TEDIX_ADMIN_PASSWORD` | an admin login (`TEDIX_ADMIN_OTP_SECRET` too if it has 2FA) |

Claude Code (from the repo, after `npm install`):

```sh
claude mcp add tedix-questions \
  -e TEDIX_API_URL=http://localhost:4000 -e TEDIX_ADMIN_EMAIL=you@example.com -e TEDIX_ADMIN_PASSWORD='...' \
  -- npm run --silent --prefix /path/to/Tedix_Backend_2.0 mcp
```

Claude Desktop (`claude_desktop_config.json`), using the built file (`npm run build` first):

```json
{
  "mcpServers": {
    "tedix-questions": {
      "command": "node",
      "args": ["/path/to/Tedix_Backend_2.0/apps/api/dist/generate-question/mcp-server.js"],
      "env": { "TEDIX_API_URL": "http://localhost:4000", "TEDIX_ADMIN_EMAIL": "you@example.com", "TEDIX_ADMIN_PASSWORD": "..." }
    }
  }
}
```

Then ask, for example: "Make templates from 2+3=5, 7-4=3 and 3×4=12, show me 15 questions, and
save them in the micro lesson Addition up to 20."

## Not done yet

- The student app reads exercises from Rails, so it shows the saved sample. Serving new numbers
  to students needs the app's exercise endpoint on the 2.0 API (it calls `generate()` from
  `template.ts`), or a small Rails hook.
- The admin exercise editor does not show that an exercise is a template; editing it there
  changes the sample only.
