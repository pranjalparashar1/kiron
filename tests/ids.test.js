// Question ids. Quiz format v2 lets a question bring its own "id", so rewording or moving it keeps its progress.
// A question without one (every quiz written so far) is known by its place, s<part>q<question>, exactly as before.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { mod, read } = require("./load.js");
const { validateQuiz } = mod("validate");
const { eachQ, getQ, hasQ, freshen, prints, blankProg } = mod("store");
const { buildRound } = mod("round");

const q = (id, prompt) => Object.assign({ type: "single", prompt, options: ["a", "b", "c", "d"], correct: 1, hint: "h", answer: "x" }, id === undefined ? {} : { id });
const quiz = qs => validateQuiz({ title: "Ids", sections: [{ title: "One", questions: qs }] }).quiz;
const ids = z => { const out = []; eachQ(z, (qq, id) => out.push(id)); return out; };

test("questions without an id keep their place-ids (format v1)", () => {
  assert.deepEqual(ids(quiz([q(undefined, "A?"), q(undefined, "B?")])), ["s0q0", "s0q1"]);
  for (const f of JSON.parse(read("quizzes.json")).quizzes) {
    const z = validateQuiz(JSON.parse(read(f))).quiz;
    ids(z).forEach(id => assert.match(id, /^s\d+q\d+$/, f));
  }
});

test("a question's own id is used, and an unusable or repeated one is ignored", () => {
  const z = quiz([q("dur-1", "A?"), q("dur-1", "B?"), q("s0q0", "C?"), q("bad id!", "D?"), q(7, "E?")]);
  assert.deepEqual(ids(z), ["dur-1", "s0q1", "s0q2", "s0q3", "7"]);
  assert.equal(getQ(z, "dur-1").q.prompt, "A?");
  assert.equal(getQ(z, "s0q3").q.prompt, "D?");
  assert.ok(hasQ(z, "7") && !hasQ(z, "s0q0") && !hasQ(z, "nope") && !hasQ(z, undefined));
});

test("rewording a question with an id keeps its progress", () => {
  const before = quiz([q("a", "A?"), q("b", "B?")]);
  const P = Object.assign(blankProg(), { st: { a: "right", b: "miss" }, fp: prints(before) });
  const after = quiz([q("b", "B, said another way?"), q("a", "A?")]);
  freshen(after, P);
  assert.deepEqual(P.st, { a: "right", b: "miss" });
});

test("rewording a question without an id still starts it again (as in v1)", () => {
  const before = quiz([q(undefined, "A?"), q(undefined, "B?")]);
  const P = Object.assign(blankProg(), { st: { s0q0: "right", s0q1: "miss" }, fp: prints(before) });
  freshen(quiz([q(undefined, "A?"), q(undefined, "B, said another way?")]), P);
  assert.deepEqual(P.st, { s0q0: "right" });
});

test("giving a quiz ids later carries its progress over", () => {
  const before = quiz([q(undefined, "A?"), q(undefined, "B?")]);
  const P = Object.assign(blankProg(), { st: { s0q0: "right", s0q1: "miss" }, fp: prints(before) });
  freshen(quiz([q("a", "A?"), q("b", "B?")]), P);
  assert.deepEqual(P.st, { a: "right", b: "miss" });
});

test("rounds are built from ids", () => {
  const z = quiz([q("a", "A?"), q("b", "B?"), q(undefined, "C?")]), P = blankProg();
  assert.deepEqual([...buildRound(z, P).ids], ["a", "b", "s0q2"]);
});
