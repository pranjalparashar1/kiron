# Adding a quiz to Kiron

This is the only file you need to read to add a quiz. You don't need to read the app's code (`js/`).

## Steps

1. Write `quiz-<short-name>.json` in the repo root, in the format below.
2. Add its file name to the top of the list in `quizzes.json`.
3. Bump `VERSION` in `sw.js` (for example `kiron-v9` to `kiron-v10`) so phones pick it up.
4. Check it: `node --test tests/*.test.js` (every quiz must load and follow the rules below; it also runs on the pull request).

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

Optional quiz-level fields, next to `title`:

- `"round": 8` sets how many questions a round has (default 7, at most 50).
- `"test": true` lists the quiz on top of the library, above "All quizzes". Only for playtest quizzes. The three test quizzes (`quiz-test-*.json`) are kept in the repo but left out of `quizzes.json` for now; add a file back to the list to show it again.
- `"fixed": true` keeps options in the order written (no shuffle). Only for test quizzes that need it.

- `single` is the default: exactly 4 options of similar length, wrong ones built from real confusions. No "all of the above".
- `id` (optional, per question): a short name that never changes, such as `"dur-1"`. Letters, digits, `-`, `_`, `.` or `:`, up to 64 characters, unique in the quiz. With an id, you can reword or move a question and people keep their progress on it. Without one, a question is known by its place, and rewording it starts it again for everyone. Don't add ids to a quiz people are already using unless the questions stay worded as they are (the app carries progress over when the wording matches).
- `correct` counts from 0. Options are shuffled in the app, so the right one can go first.
- `answer` is the one-line "why" shown after a tap. (`why` works as the field name too.)
- Calculations: four formulas or setups as options, not four numbers, with `"tags": ["calc"]`.
- `multi` and `order` only when the idea is naturally a set or a sequence. For `order`, list `items` in the correct order.
- `**bold**`, `*italic*`, `x^2`, `z_m`, `a/b` and `√(…)` are typeset as you type them. For anything bigger, see Maths below.
- Prompts short (under 25 words). Follow the material's order. Only facts from the material.

Older quizzes use `text`/`number` questions with an `mcq` field; the app still plays them, so leave them as they are.

## Maths

Simple maths needs nothing special. Plain text is typeset on its own: `x^2`, `x^(n+1)`, `z_m`, `104/1.06^3`, `Δp/Δy`, `(a + b)/(c − d)`, and `√250` or `√(a/b)` (the bar covers the whole bracket). Brackets around a stacked fraction grow to its height on their own, as in `(1 + r/2)^4` or `[(1.03)^10 ÷ (1.02)^4]^(1/6)`. A fraction in a power, `1.03^(89/180)`, is drawn as a small stacked fraction raised above the base, so it can't be read as 1.03 times a fraction; in TeX write it the same way, `1.03^{89/180}`.

For roots over fractions, sums, integrals, derivatives and anything nested, write TeX between `\(` and `\)`. It works in prompts, options, hints and answers, and mixes with normal text. Use `\[` and `\]` instead to put a formula on its own centred line (good in a prompt).

**In JSON every backslash is doubled.** So `\(\frac{a}{b}\)` is written `"\\(\\frac{a}{b}\\)"`. Step 4's parse check catches most slips.

| You want | Write (before doubling the backslashes) |
| --- | --- |
| Fraction | `\frac{a + b}{2n}` |
| Root, cube root | `\sqrt{\frac{a}{b}}`, `\sqrt[3]{x}` |
| Power, subscript, both | `x^2`, `x_i`, `x_i^2`, `e^{-rt}` (braces when it is more than one character) |
| Sum, product | `\sum_{i=1}^{n} x_i`, `\prod_{t=1}^{T}(1 + r_t)` |
| Integral, loop integral | `\int_0^\infty f(x)\,dx`, `\oint_C F\,ds` |
| Derivative, partial | `\frac{dy}{dx}`, `\frac{d^2P}{dy^2}`, `\frac{\partial f}{\partial x}`, `f'(x)` |
| Limit, max, min | `\lim_{h \to 0}`, `\max_{x}` |
| Brackets that grow | `\left( \frac{1 + r}{1 + g} \right)^n`; plain `( )` and `[ ]` also grow when there is something tall inside |
| Evaluated at | `\left. \frac{dP}{dy} \right\|_{y_0}` |
| Greek | `\mu \sigma \Delta \pi \theta …` (or just type μ, σ, Δ) |
| Signs | `\times \cdot \div \pm \le \ge \ne \approx \to \infty \partial` |
| Mean bar, hat | `\bar{x}`, `\hat{y}` |
| Words inside maths | `\text{coupon}`; functions `\ln \log \exp \sin \cos` |
| Choose | `\binom{n}{k}` |
| Small gap | `\,` |

Everything nests: `\sqrt{\frac{\sum_{i=1}^{n}(x_i - \mu)^2}{n - 1}}`. Keep each formula short enough for a phone line; a long one in an option wraps at its `=` and `+` signs, and a `\[ … \]` line scrolls sideways. A command the app doesn't know is shown as written, so a slip is easy to spot. `quiz-test-maths.json` shows each of these in use.
