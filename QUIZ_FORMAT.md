# Adding a quiz to Kiron

This is the only file you need to read to add a quiz. You don't need to read `app.js`.

## Steps

1. Write `quiz-<short-name>.json` in the repo root, in the format below.
2. Add its file name to the top of the list in `quizzes.json`.
3. Bump `VERSION` in `sw.js` (for example `kiron-v9` to `kiron-v10`) so phones pick it up.
4. Check it parses: `node -e "JSON.parse(require('fs').readFileSync('quiz-<short-name>.json','utf8'))"`.

## Format (tap-only)

Quizzes are tap-to-answer only. Don't write a typed version of each question (no `keyPoints`, `need`, `match` or `mcq`). Every question has a hint.

```json
{
  "format": "study-buddy-quiz",
  "version": 1,
  "id": "short-lowercase-name",
  "title": "Short quiz title",
  "source": "What the material is",
  "purpose": "One sentence: what it's being read for",
  "sections": [
    {
      "title": "Section topic",
      "ref": "pp. 2-10",
      "questions": [
        { "type": "single", "prompt": "Why does X happen?", "hint": "Think about ...",
          "options": ["Right", "Plausible wrong", "Plausible wrong", "Plausible wrong"],
          "correct": 0, "answer": "One line on why (under 30 words).", "ref": "p. 4" },
        { "type": "multi", "prompt": "Which ...? Pick all that apply.", "hint": "...",
          "options": ["A", "B", "C", "D"], "correct": [0, 2], "answer": "..." },
        { "type": "order", "prompt": "Put these in order, first to last.", "hint": "...",
          "items": ["First", "Second", "Third"], "answer": "Why this order." }
      ]
    }
  ]
}
```

- `single` is the default: exactly 4 options of similar length, wrong ones built from real confusions. No "all of the above".
- `correct` counts from 0. Options are shuffled in the app, so the right one can go first.
- `answer` is the one-line "why" shown after a tap. (`why` works as the field name too.)
- Calculations: four formulas or setups as options, not four numbers, with `"tags": ["calc"]`.
- `multi` and `order` only when the idea is naturally a set or a sequence. For `order`, list `items` in the correct order.
- `**bold**`, `*italic*`, `x^2`, `z_m` and `a/b` are typeset.
- Prompts short (under 25 words). Follow the material's order. Only facts from the material.

Older quizzes use `text`/`number` questions with an `mcq` field; the app still plays them, so leave them as they are.
