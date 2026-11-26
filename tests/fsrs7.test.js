// Spaced recall (Kiron 1.8.0): the FSRS-7 scheduler, the grade an answer earns, and the Today round.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { mod } = require("./load.js");
const F = mod("fsrs7");
const { validateQuiz } = mod("validate");
const { isNumQ } = mod("round");
const { getQ } = mod("store");

const MIN = 1 / 1440, HOUR = 1 / 24, DAY = F.DAY;

test("FSRS7_W holds the 34 default weights of the reference", () => {
  assert.equal(F.FSRS7_W.length, 34);
  assert.deepEqual(F.FSRS7_W.slice(0, 4), [0.1104, 2.2395, 3.9221, 11.7841]);
  assert.deepEqual(F.FSRS7_W.slice(31), [0.3734, 0.5333, 0.3048]);
  assert.ok(Object.isFrozen(F.FSRS7_W));
});

test("same-day decay: 10 minutes, 6 hours and 3 days are told apart", () => {
  for (const g of [F.HARD, F.GOOD, F.EASY]) {
    const m = F.step(null, 0, g);
    const r10m = F.recall(10 * MIN, m), r6h = F.recall(6 * HOUR, m), r3d = F.recall(3, m);
    assert.ok(r10m < 1 && r10m > r6h && r6h > r3d, `grade ${g}: ${r10m} ${r6h} ${r3d}`);
  }
  // Recall falls within the first day already (the fast trace), not only after whole days.
  const m = F.step(null, 0, F.GOOD);
  assert.ok(F.recall(0, m) - F.recall(6 * HOUR, m) > 0.01);
  assert.ok(F.recall(0, m) > 0.999);
});

test("intervals: Easy > Good > Hard > Again, on a first look and on later ones", () => {
  const order = st => [F.AGAIN, F.HARD, F.GOOD, F.EASY].map(g => F.interval(F.step(st, st ? st.t : 0, g)));
  const first = order(null);
  const later = order(Object.assign(F.step(null, 0, F.GOOD), { t: 2 }));
  const sameDay = order(Object.assign(F.step(null, 0, F.GOOD), { t: 10 * MIN }));
  for (const iv of [first, later, sameDay]) for (let i = 1; i < 4; i++) assert.ok(iv[i] > iv[i - 1], JSON.stringify(iv));
});

test("an Again comes back the same day; under a day is in fractional days", () => {
  const iv = F.interval(F.step(null, 0, F.AGAIN));
  assert.ok(iv > 0 && iv < 1, String(iv));
  assert.ok(Math.abs(F.recall(iv, F.step(null, 0, F.AGAIN)) - F.RETAIN) < 1e-6);
});

test("interval hits the 0.90 target", () => {
  for (const g of [2, 3, 4]) { const m = F.step(null, 0, g), t = F.interval(m); assert.ok(Math.abs(F.recall(t, m) - 0.9) < 1e-6, `grade ${g}`); }
});

test("a lapse pulls stability down and difficulty up", () => {
  const m = F.step(F.step(null, 0, F.GOOD), 4, F.GOOD), lapse = F.step(m, 20, F.AGAIN);
  assert.ok(lapse.sLong < m.sLong && lapse.sShort <= 0.8 * lapse.sLong + 1e-12 && lapse.d > m.d);
});

test("grade mapping: how the answer went, never a self-rating", () => {
  const g = o => F.gradeOf(Object.assign({ status: "right", used: 0.5 }, o));
  assert.equal(g({ status: "miss" }), 1);
  assert.equal(g({ timedOut: true, status: "skip" }), 1);
  assert.equal(g({ used: 0.2 }), 4);
  assert.equal(g({ used: 0.34 }), 4);
  assert.equal(g({ used: 0.35 }), 3);
  assert.equal(g({ used: 0.7 }), 3);
  assert.equal(g({ used: 0.71 }), 2);
  assert.equal(g({ used: 0.1, hinted: true }), 2);
  assert.equal(g({ used: 0.1, burned: true }), 2);
  assert.equal(g({ status: "partial", used: 0.1 }), 2);
  assert.equal(g({ used: undefined }), 2);
});

test("review saves sb:fsrs:<quizId> by question id", () => {
  localStorage.removeItem("sb:fsrs:mem-test");
  const now = Date.UTC(2026, 10, 26, 9);
  const a = F.review("mem-test", "q1", F.GOOD, now);
  const saved = JSON.parse(localStorage.getItem("sb:fsrs:mem-test")).q1;
  assert.deepEqual(Object.keys(saved).sort(), ["d", "due", "lapses", "last", "reps", "sLong", "sShort"]);
  assert.equal(saved.reps, 1); assert.equal(saved.lapses, 0); assert.equal(saved.last, now);
  assert.ok(saved.due > now); assert.deepEqual(saved, a);
  const b = F.review("mem-test", "q1", F.AGAIN, saved.due);
  assert.equal(b.reps, 2); assert.equal(b.lapses, 1);
  assert.equal(b.due - b.last, F.GAP, "a miss waits ten minutes before it is due again");
});

/* ---- the Today round ---- */
const mk = (id, n, calcEvery) => validateQuiz({ id, title: id, sections: [{ title: "P", questions: Array.from({ length: n }, (_, i) => (
  { id: "q" + i, type: "single", prompt: id + " question " + i, options: ["a", "b"], correct: 0, answer: "a", tags: calcEvery && i % calcEvery === 0 ? ["calc"] : [] })) }] }).quiz;
const due = (quizId, id, r, now) => {
  // A memory whose recall right now is about r: Good first look, then wait until recall falls to r.
  const m = F.step(null, 0, F.GOOD), t = F.interval(m, r);
  const all = F.loadMem(quizId); all[id] = Object.assign(m, { last: now - Math.round(t * DAY), due: now - 1, reps: 1, lapses: 0 }); localStorage.setItem(F.fsrsKey(quizId), JSON.stringify(all));
};

test("Today: nothing due, no round", () => {
  const a = mk("today-none", 3); localStorage.removeItem("sb:fsrs:today-none");
  assert.equal(F.buildTodayRound([a]), null);
  assert.equal(F.anyDue([a]), false);
  F.review("today-none", "q0", F.EASY);   // due in weeks
  assert.equal(F.anyDue([a]), false);
});

test("Today: across quizzes, the most forgotten first", () => {
  const now = Date.UTC(2026, 10, 26, 9), a = mk("today-a", 4), b = mk("today-b", 4);
  ["today-a", "today-b"].forEach(k => localStorage.removeItem("sb:fsrs:" + k));
  due("today-a", "q0", 0.85, now); due("today-b", "q2", 0.6, now); due("today-a", "q3", 0.75, now);
  F.review("today-b", "q1", F.EASY, now);   // not due
  const refs = F.buildTodayRound([a, b], now);
  assert.deepEqual(refs, [{ quizId: "today-b", id: "q2" }, { quizId: "today-a", id: "q3" }, { quizId: "today-a", id: "q0" }]);
});

test("Today: at most 7, and never more than 3 numbers questions, never one first", () => {
  const now = Date.UTC(2026, 10, 26, 9), a = mk("today-cap", 20, 2);   // every other question is a calc
  localStorage.removeItem("sb:fsrs:today-cap");
  // The calc questions are the most forgotten, so plain priority would open on one.
  for (let i = 0; i < 20; i++) due("today-cap", "q" + i, i % 2 === 0 ? 0.3 + i / 100 : 0.6 + i / 100, now);
  const refs = F.buildTodayRound([a], now), quiz = F.todayQuiz(refs, [a]);
  assert.equal(refs.length, 7);
  const qs = refs.map(r => getQ(a, r.id).q);
  assert.ok(!isNumQ(qs[0]), "starts with a numbers question");
  assert.ok(qs.filter(isNumQ).length <= 3);
  assert.equal(quiz.sections[0].questions.length, 7);
  assert.equal(quiz.id, F.TODAY_ID);
  assert.deepEqual(F.sourceOf(quiz, "today-cap/q1"), { quizId: "today-cap", id: "q1" });
  assert.deepEqual(F.sourceOf(a, "q1"), { quizId: "today-cap", id: "q1" });
});

test("Today: a question no longer in its quiz is left out", () => {
  const now = Date.UTC(2026, 10, 26, 9), a = mk("today-gone", 2);
  localStorage.removeItem("sb:fsrs:today-gone");
  due("today-gone", "q1", 0.5, now); due("today-gone", "q9", 0.4, now);
  assert.deepEqual(F.buildTodayRound([a], now), [{ quizId: "today-gone", id: "q1" }]);
});
