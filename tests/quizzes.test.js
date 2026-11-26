// Every quiz file in the repo must load in the app, and the listed ones must follow QUIZ_FORMAT.md.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { load, read, ROOT } = require("./load.js");

const SB = load().SB;
const listed = JSON.parse(read("quizzes.json")).quizzes;
const files = fs.readdirSync(ROOT).filter(f => /^quiz-.+\.json$/.test(f)).sort();
// Older quizzes written before hints were a rule. Add hints, then take the file off this list.
const NO_HINTS_YET = ["quiz-fixed-income-module-1.json", "quiz-flipkart-food.json", "quiz-nutribharat.json", "quiz-pharmeasy-2025.json"];

test("quizzes.json lists files that exist, once each", () => {
  for (const f of listed) assert.ok(files.includes(f), `${f} is listed but missing`);
  assert.equal(new Set(listed).size, listed.length, "a quiz is listed twice");
});

for (const f of files) {
  test(`${f} loads in the app`, () => {
    let raw;
    assert.doesNotThrow(() => { raw = JSON.parse(read(f)); }, `${f} is not valid JSON`);
    const r = SB.validateQuiz(raw);
    assert.deepEqual(r.errors || [], [], `${f}: ${(r.errors || []).join(" | ")}`);
  });
}

test("quiz ids are unique", () => {
  const ids = files.map(f => SB.validateQuiz(JSON.parse(read(f))).quiz.id);
  assert.equal(new Set(ids).size, ids.length, ids.join(", "));
});

for (const f of listed) {
  test(`${f} follows the tap-only rules`, () => {
    const quiz = SB.validateQuiz(JSON.parse(read(f))).quiz;
    quiz.sections.forEach((s, si) => s.questions.forEach((q, qi) => {
      const where = `${f} part ${si + 1} question ${qi + 1}`;
      const form = SB.formOf(q);
      assert.ok(["pick", "multi", "order"].includes(form.kind), `${where} can't be answered by tapping`);
      if (!NO_HINTS_YET.includes(f)) assert.ok(q.hint, `${where} has no hint`);
      if (form.kind === "pick") {
        assert.ok(form.correct >= 0 && form.correct < form.options.length, `${where}: correct is out of range`);
        if (!quiz.test) assert.equal(new Set(form.options).size, form.options.length, `${where} has two identical options`);
      }
    }));
  });
}

test("the list of quizzes without hints only shrinks", () => {
  for (const f of NO_HINTS_YET) {
    if (!files.includes(f)) continue;
    const quiz = SB.validateQuiz(JSON.parse(read(f))).quiz;
    const missing = quiz.sections.some(s => s.questions.some(q => !q.hint));
    assert.ok(missing, `${f} now has every hint: take it off NO_HINTS_YET`);
  }
});
