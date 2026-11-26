// The Socratic loop (Kiron 1.9.0): format v2 parts in quiz files, the placement round, skill levels, probes and
// the devil's advocate check.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { mod, read } = require("./load.js");

const S = mod("socratic"), { validateQuiz } = mod("validate"), { readQuiz } = mod("parser"), { formOf, buildRound, isNumQ } = mod("round");
const { getQ, secKey, blankProg } = mod("store"), { gradeOf } = mod("fsrs7");
const v2 = () => validateQuiz(readQuiz(fs.readFileSync(path.join(__dirname, "fixtures", "socratic-v2.md"), "utf8")).data).quiz;

/* ---- the quiz file ---- */
test("a v2 quiz from an AI reply keeps its probes, devil's advocate, difficulty, diagnostic and ids", () => {
  const quiz = v2();
  assert.ok(quiz.socratic);
  assert.deepEqual(quiz.sections.map(s => s.id), ["price-yield", "duration", "curve", "credit"]);
  const q = getQ(quiz, "py-1").q;
  assert.equal(q.difficulty, 1); assert.equal(q.diagnostic, true);
  assert.deepEqual(Object.keys(q.probes), ["1", "2"]);
  assert.deepEqual(q.probes[1].options, ["Yes, more", "No, less"]); assert.equal(q.probes[1].correct, 1);
  assert.equal(getQ(quiz, "py-3").q.da.correct, 1);
  assert.match(getQ(quiz, "dur-2").q.options[0], /\\\(-7/);
});

test("every quiz in the repo still reads, and is not Socratic", () => {
  for (const f of JSON.parse(read("quizzes.json")).quizzes) {
    const quiz = validateQuiz(JSON.parse(read(f))).quiz;
    assert.ok(quiz, f); assert.equal(quiz.socratic, undefined, f);
  }
});

test("broken probes and devil's advocate are dropped, never the quiz", () => {
  const base = { type: "single", prompt: "P?", options: ["a", "b", "c", "d"], correct: 0, answer: "a" };
  const one = (extra) => validateQuiz({ title: "T", sections: [{ title: "S", questions: [Object.assign({}, base, extra)] }] });
  const r = one({
    probes: {
      0: { prompt: "On the right option", options: ["x", "y"], correct: 0 },     // not a wrong option
      1: { prompt: "Out of range", options: ["x", "y"], correct: 2 },
      2: { prompt: "One option", options: ["x"], correct: 0 },
      3: { prompt: "Good one", options: ["x", "y"], correct: "1", why: "w" },
      9: { prompt: "No such option", options: ["x", "y"], correct: 0 }
    },
    devilsAdvocate: { prompt: "", options: ["x", "y"], correct: 0 },
    difficulty: 7, diagnostic: "yes"
  });
  assert.equal(r.errors, undefined);
  const q = r.quiz.sections[0].questions[0];
  assert.deepEqual(Object.keys(q.probes), ["3"]); assert.equal(q.probes[3].correct, 1);
  assert.equal(q.da, undefined); assert.equal(q.difficulty, undefined); assert.equal(q.diagnostic, undefined);
  // On a multi-select, probes are left out (they need one right option to argue against).
  const m = validateQuiz({ title: "T", sections: [{ title: "S", questions: [{ type: "multi", prompt: "P?", options: ["a", "b"], correct: [0], answer: "a", probes: { 1: { prompt: "q", options: ["x", "y"], correct: 0 } } }] }] }).quiz;
  assert.equal(m.sections[0].questions[0].probes, undefined);
  assert.equal(m.socratic, undefined);
});

/* ---- the placement round ---- */
test("placement: one diagnostic question per part, levels seeded 2 if right and 1 if missed", () => {
  const quiz = v2(), P = blankProg(), r = S.buildDiagnostic(quiz, P);
  assert.equal(r.kind, "diag");
  assert.deepEqual([...r.ids].sort(), ["cr-1", "dur-1", "py-1", "yc-1"]);
  assert.equal(new Set(r.ids.map(id => getQ(quiz, id).si)).size, 4);
  assert.ok(!isNumQ(getQ(quiz, r.ids[0]).q));
  assert.equal(S.learn(undefined, { diag: true, right: true }).lv, 2);
  assert.equal(S.learn(undefined, { diag: true, right: false }).lv, 1);
});

test("placement: only once, only with nothing answered, only when the quiz marks diagnostic questions", () => {
  const quiz = v2();
  assert.equal(S.buildDiagnostic(quiz, Object.assign(blankProg(), { diagDone: true })), null);
  assert.equal(S.buildDiagnostic(quiz, Object.assign(blankProg(), { st: { "py-2": "right" } })), null);
  const plain = validateQuiz(JSON.parse(read("quiz-yield-measures.json"))).quiz;
  assert.equal(S.buildDiagnostic(plain, blankProg()), null);
});

test("placement: topped up to 3 when fewer parts mark one", () => {
  const q = (id, diag) => ({ id, type: "single", prompt: id + "?", options: ["a", "b"], correct: 0, answer: "a", diagnostic: diag });
  const quiz = validateQuiz({ title: "T", sections: [{ title: "A", questions: [q("a1", true), q("a2", true), q("a3", true)] }, { title: "B", questions: [q("b1", false)] }] }).quiz;
  assert.deepEqual(S.buildDiagnostic(quiz, blankProg()).ids, ["a1", "a2", "a3"]);
});

test("after placement, beginner questions in a part you already know wait at the back", () => {
  const quiz = v2(), P = blankProg();
  P.sk[secKey(quiz.sections[0], 0)] = { lv: 2 };
  P.st["py-1"] = "right"; P.st["dur-1"] = "miss"; P.st["yc-1"] = "right"; P.st["cr-1"] = "right";
  const r = buildRound(quiz, P);
  assert.ok(r.ids.length);
  // py-1 is the only difficulty-1 left new in part 1 and it is answered; dur-3 etc. come first in their order.
  const P2 = blankProg(); P2.sk["price-yield"] = { lv: 2 };
  const ids = buildRound(quiz, P2).ids;
  assert.ok(ids.indexOf("py-1") === -1 || ids.indexOf("py-1") > ids.indexOf("py-2"), JSON.stringify(ids));
});

/* ---- skill levels ---- */
test("levels: help gives 2, on your own gives 3", () => {
  assert.equal(S.learn({ lv: 1 }, { right: false, helped: true }).lv, 2);
  assert.equal(S.learn({ lv: 1 }, { right: true }).lv, 3);
  assert.equal(S.learn(undefined, { right: false }).lv, 1);
});

test("level 4 needs 2 or more checks, one of them spaced (12 hours or more)", () => {
  let s = S.learn(undefined, { right: true });
  s = S.learn(s, { right: true });
  assert.equal(s.lv, 3, "two same-day checks are not enough");
  s = S.learn(s, { right: true, spaced: true });
  assert.equal(s.lv, 4);
  assert.equal(S.learn(S.learn(undefined, { right: true, spaced: true }), { right: false, helped: true }).lv, 3, "one check is not enough");
  assert.equal(S.isSpaced(Date.now() - 11.9 * 36e5), false);
  assert.equal(S.isSpaced(Date.now() - 12 * 36e5), true);
  assert.equal(S.isSpaced(0), false);
});

test("level 5: a hardest question with its devil's advocate passed, on a spaced look", () => {
  let s = { lv: 4, ok: 2, spaced: true };
  assert.equal(S.learn(s, { right: true, edge: true }).lv, 4, "not spaced");
  assert.equal(S.learn(s, { right: true, spaced: true }).lv, 4, "no edge");
  assert.equal(S.learn(s, { right: true, spaced: true, edge: true }).lv, 5);
});

test("a miss on a spaced look drops a level of 3 to 5 by one; a same-day miss does not", () => {
  for (const lv of [3, 4, 5]) assert.equal(S.learn({ lv, ok: 3, spaced: true }, { right: false, spaced: true }).lv, lv - 1);
  assert.equal(S.learn({ lv: 4, ok: 3, spaced: true }, { right: false }).lv, 4);
  assert.equal(S.learn({ lv: 2 }, { right: false, spaced: true }).lv, 2);
  // Back at 3 it has to show itself again: the next same-day right does not jump straight back to 4.
  assert.equal(S.learn(S.learn({ lv: 4, ok: 3, spaced: true }, { right: false, spaced: true }), { right: true }).lv, 3);
});

/* ---- probes and the devil's advocate ---- */
test("a wrong pick with a probe opens it; at most 2 probes; then the answer is shown", () => {
  const q = getQ(v2(), "py-1").q, f = formOf(q);
  assert.equal(S.onPick(q, f, { tries: 0 }, 1, true), "probe");
  assert.equal(S.onPick(q, f, { tries: 1 }, 2, true), "probe");
  assert.equal(S.onPick(q, f, { tries: 2 }, 2, true), "miss", "capped at 2");
  assert.equal(S.onPick(q, f, { tries: 0 }, 3, true), "miss", "no probe for that option");
  assert.equal(S.onPick(q, f, { tries: 0 }, 1, false), "miss", "no teaching in the placement round");
  assert.equal(S.onPick(q, f, { tries: 0 }, 0, true), "right");
  assert.equal(S.onPick(q, f, { tries: 1 }, 0, true), "corrected");
  assert.equal(S.tellMe(), "miss", "Just tell me ends the question at once");
});

test("grades: put right after a probe is Again; the devil's advocate decides Easy or Hard", () => {
  assert.equal(gradeOf({ status: "partial", corrected: true, used: 0.1 }), 1);
  assert.equal(gradeOf({ status: "right", used: 0.1, da: true }), 4);
  assert.equal(gradeOf({ status: "right", used: 0.5, da: true }), 3);
  assert.equal(gradeOf({ status: "right", used: 0.1, da: false }), 2);
  assert.equal(gradeOf({ status: "right", used: 0.1, da: null }), 3, "shown but left: not Easy");
});

test("the devil's advocate comes up on about 4 in 10 right picks", () => {
  const q = getQ(v2(), "py-3").q;
  assert.equal(S.daFires(q, () => 0.39), true);
  assert.equal(S.daFires(q, () => 0.4), false);
  assert.equal(S.daFires(getQ(v2(), "py-1").q, () => 0), false, "no devil's advocate written");
});
