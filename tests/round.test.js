// Rounds: the right questions, in a kind order. A tester quit at a numbers question that came first.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { load, read } = require("./load.js");

const SB = load().SB;
const fresh = () => ({ st: {}, a: {}, h: {}, n: {} });
const quizOf = f => SB.validateQuiz(JSON.parse(read(f))).quiz;
const qOf = (quiz, id) => { const [, si, qi] = id.match(/^s(\d+)q(\d+)$/); return quiz.sections[+si].questions[+qi]; };
const isNum = q => q.type === "number" || (q.tags || []).includes("calc");

for (const f of JSON.parse(read("quizzes.json")).quizzes) {
  test(`${f}: every round is kind about numbers questions`, () => {
    const quiz = quizOf(f), P = fresh();
    let r, rounds = 0;
    while ((r = SB.buildRound(quiz, P)) && rounds < 100) {
      rounds++;
      const nums = r.ids.filter(id => isNum(qOf(quiz, id)));
      const allNum = nums.length === r.ids.length;
      if (!allNum) {
        assert.ok(nums.length <= 3, `round ${rounds} has ${nums.length} numbers questions`);
        assert.ok(!isNum(qOf(quiz, r.ids[0])), `round ${rounds} starts with a numbers question`);
      }
      assert.ok(r.ids.length <= (quiz.round || 7));
      r.ids.forEach(id => { P.st[id] = "right"; });
    }
    let total = 0; quiz.sections.forEach(s => { total += s.questions.length; });
    assert.equal(Object.keys(P.st).length, total, "some questions never came up");
  });
}

test("left-for-later comes back before missed", () => {
  const quiz = quizOf("quiz-test-sorting.json"), P = fresh();
  const all = SB.buildRound(quiz, P).ids;
  all.forEach((id, i) => { P.st[id] = i === 0 ? "miss" : i === 1 ? "skip" : "right"; });
  const next = SB.buildRound(quiz, P);
  assert.equal(next.kind, "skipped"); assert.deepEqual([...next.ids], [all[1]]);
  P.st[all[1]] = "right";
  const last = SB.buildRound(quiz, P);
  assert.equal(last.kind, "revisit"); assert.deepEqual([...last.ids], [all[0]]);
  P.st[all[0]] = "right";
  assert.equal(SB.buildRound(quiz, P), null);
});

test("the timer gives 20 to 60 seconds, longer for multi and order", () => {
  const short = { type: "single", prompt: "Hi?", options: ["a", "b"] };
  assert.equal(SB.durOf(short, SB.formOf(short)), 20000);
  const long = { type: "single", prompt: "word ".repeat(400), options: ["a", "b"] };
  assert.equal(SB.durOf(long, SB.formOf(long)), 60000);
  const order = { type: "order", prompt: "Hi?", items: ["a", "b"] };
  assert.equal(SB.durOf(order, SB.formOf(order)), 30000);
});
