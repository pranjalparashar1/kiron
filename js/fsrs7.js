/* Kiron: spaced recall (Kiron 1.8.0). FSRS-7, the open spaced-repetition model, decides when each question is worth
   seeing again, and the "Today" round brings back the ones that are due. Nothing is typed or rated by hand: how an
   answer went (right or not, how quickly, with a hint or a burn) stands in for the rating. No page here: plain logic,
   tested in tests/fsrs7.test.js.

   The model is FSRS-7's dual-trace forgetting curve, ported from its reference implementation
   (github.com/Expertium/fsrs-rs-speed-autoresearch, fsrs-rs/src/model.rs) with its default weights. Each question
   keeps two memory traces: a slow one (sLong, in days) and a fast one (sShort, also days) that carries same-day
   practice, so a question seen ten minutes ago, six hours ago and three days ago are told apart. Time is in
   fractional days throughout.

   Saved per quiz under sb:fsrs:<quizId>, by question id: { sLong, sShort, d, last, due, reps, lapses }, where last
   and due are times (ms since 1970). */
import { LS, getQ, hasQ } from "./store.js";
import { cushion, ROUND } from "./round.js";

// The default FSRS-7 weights (34), exactly as the reference ships them (DEFAULT_PARAMETERS).
const FSRS7_W = Object.freeze([
  0.1104, 2.2395, 3.9221, 11.7841,                                   // w0-3 first stability, by grade
  6.1686, 0.6457, 3.6807,                                            // w4-6 difficulty
  1.9795, 0.0, 1.3826, 0.7024, 0.5999, 0.8146, 0.6398, 1.0,          // w7-14 slow trace
  1.3207, 0.6707, 3.8668, 0.4416, 0.0934, 1.8631, 0.6162, 1.0869,    // w15-22 fast trace
  0.1567, 0.0801, 0.2421, 0.9464, 0.1433, 0.7145, 0.0, 0.5667,       // w23-30 forgetting curve
  0.3734, 0.5333, 0.3048                                             // w31-33 how difficulty and stability shape it
]);
// GAP: the soonest a question is due again. FSRS-7 counts in seconds, so a miss is "due" again within seconds; a
// question you just saw coming straight back on the Today card would nag, so it waits at least ten minutes.
const GAP = 10 * 6e4;
const DAY = 864e5, RETAIN = 0.9, S_MIN = 1e-4, S_MAX = 36500, D_MIN = 1, D_MAX = 10, T_MIN = 1 / 86400, T_MAX = 36500;
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const AGAIN = 1, HARD = 2, GOOD = 3, EASY = 4;

// Recall on the fast trace alone, t days after the last look.
function fastRecall(t, sf, w = FSRS7_W) {
  const decay = -clamp(w[23] * Math.pow(sf, w[33] - 0.3), 0.01, 0.95);
  const f = Math.exp(Math.min(60, Math.log(w[25]) / decay)) - 1;
  return Math.pow(Math.max(0, t) / sf * f + 1, decay);
}
// The chance of recalling it t days after the last look: the two traces mixed, the slow one weighted up as it grows.
function recall(t, st, w = FSRS7_W) {
  t = Math.max(0, t);
  const s = clamp(st.sLong, S_MIN, S_MAX), sf = clamp(st.sShort, S_MIN, S_MAX), d = clamp(st.d, D_MIN, D_MAX);
  const r1 = fastRecall(t, sf, w);
  const decay2 = -clamp(w[24], 0.01, 0.95), f2 = Math.pow(w[26], 1 / decay2) - 1;
  const r2 = Math.pow(t / s * f2 * Math.exp((d - 5) * (w[32] - 0.3)) + 1, decay2);
  const w1 = w[27] * Math.pow(sf, -w[29]), w2 = w[28] * Math.pow(s, w[30]) * Math.exp((d - 5) * (w[31] - 0.5));
  return ((w1 * r1 + w2 * r2) / (w1 + w2)) * (1 - 2e-5) + 1e-5;
}
// One trace's stability after a look that went `g`, from block b of the weights (7 = slow, 15 = fast).
function nextStab(s, d, r, g, b, w) {
  const fail = w[b + 3] * (Math.pow(s + 1, w[b + 4]) - 1) * Math.exp((1 - r) * w[b + 5]), afterLapse = Math.min(s, fail);
  if (g === AGAIN) return afterLapse;
  const grow = Math.exp(w[b] - 1.5) * (11 - d) * Math.pow(s, -w[b + 1]) * (Math.exp((1 - r) * w[b + 2]) - 1)
    * (g === HARD ? w[b + 6] : 1) * (g === EASY ? w[b + 7] : 1) + 1;
  return Math.max(afterLapse, s * grow);
}
const firstD = (g, w) => w[4] - Math.exp(w[5] * (g - 1)) + 1;
function nextD(d, g, r, w) {
  let delta = -w[6] * (g - 3);
  if (g === AGAIN) delta *= r + 0.1;   // forgetting something it expected you to know says more about the question
  const nd = d + (10 - d) * delta / 9;
  return clamp(0.01 * firstD(EASY, w) + 0.99 * nd, D_MIN, D_MAX);
}
// The memory after a look graded g (1-4), t days after the one before. No state yet = the first look.
function step(st, t, g, w = FSRS7_W) {
  if (!st || !(st.sLong > 0)) {
    const s = clamp(w[g - 1], S_MIN, S_MAX);
    return { sLong: s, sShort: clamp(0.8 * s, S_MIN, S_MAX), d: clamp(firstD(g, w), D_MIN, D_MAX) };
  }
  const s = clamp(st.sLong, S_MIN, S_MAX), sf = clamp(st.sShort, S_MIN, S_MAX), d = clamp(st.d, D_MIN, D_MAX);
  const r = recall(t, { sLong: s, sShort: sf, d }, w);
  const sLong = clamp(nextStab(s, d, r, g, 7, w), S_MIN, S_MAX);
  let sShort = nextStab(sf, d, fastRecall(t, sf, w), g, 15, w);
  if (g === AGAIN) sShort = Math.min(sShort, 0.8 * sLong);   // after a lapse the fast trace starts again below the slow one
  return { sLong, sShort: clamp(sShort, S_MIN, S_MAX), d: nextD(d, g, r, w) };
}
// Days until recall falls to `target`. The curve has no closed-form inverse: halve the gap (in log time) until it is found.
function interval(st, target = RETAIN, w = FSRS7_W) {
  if (recall(T_MIN, st, w) <= target) return T_MIN;
  if (recall(T_MAX, st, w) >= target) return T_MAX;
  let lo = Math.log(T_MIN), hi = Math.log(T_MAX);
  for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (recall(Math.exp(m), st, w) > target) lo = m; else hi = m; }
  return Math.exp((lo + hi) / 2);
}

/* How an answer went, as an FSRS grade. Nobody is asked to rate themselves.
   1 Again: a wrong pick, or the timer ran out.   2 Hard: right, but after a hint or a burn, or with over 70% of the
   timer gone; a partly right multi-select or ordering also counts here.   3 Good: right and clean, at 35-70% of the
   timer.   4 Easy: right and clean, under 35% of the timer (and the devil's advocate passed, if it came up).
   Kiron 1.9.0: a wrong pick put right after a probe is still Again; a missed devil's advocate makes it Hard. `used` is the share of the timer used (0-1). */
function gradeOf({ status, timedOut, hinted, burned, used, corrected, da }) {
  if (timedOut || corrected || status === "miss" || status === "skip") return AGAIN;   // right only after a probe: still Again
  if (status === "partial") return HARD;
  if (hinted || burned || da === false || !(used <= 0.7)) return HARD;   // da === false: the devil's advocate check was missed
  if (used < 0.35) return da === null ? GOOD : EASY;   // da === null: it was shown and left unanswered, so not Easy
  return GOOD;
}

const fsrsKey = quizId => "sb:fsrs:" + quizId;
const loadMem = quizId => LS.get(fsrsKey(quizId), {}) || {};
// Record one look at a question and schedule the next. Returns the question's new memory.
function review(quizId, id, g, now = Date.now()) {
  const all = loadMem(quizId), was = all[id];
  const t = was && was.last ? Math.max(0, now - was.last) / DAY : 0;
  const m = step(was, t, g), reps = was ? was.reps || 0 : 0;
  const next = Object.assign(m, { last: now, due: now + Math.max(GAP, Math.round(interval(m) * DAY)), reps: reps + 1, lapses: (was ? was.lapses || 0 : 0) + (g === AGAIN && reps > 0 ? 1 : 0) });
  all[id] = next; LS.set(fsrsKey(quizId), all);
  return next;
}

/* ---- Today: the questions that are due, from every quiz on this phone ---- */
const TODAY_ID = "kiron-today", SEP = "/";   // quiz ids never hold a "/", so "<quizId>/<questionId>" names one question anywhere
// Every due question, the most forgotten first: [{ quizId, id, r }].
function dueList(quizzes, now = Date.now()) {
  const out = [];
  for (const quiz of quizzes) {
    if (!quiz || quiz.id === TODAY_ID) continue;
    const mem = loadMem(quiz.id);
    for (const id in mem) {
      const m = mem[id];
      if (!m || !(m.due <= now) || !hasQ(quiz, id)) continue;
      out.push({ quizId: quiz.id, id, r: recall(Math.max(0, now - m.last) / DAY, m) });
    }
  }
  return out.sort((a, b) => a.r - b.r || (a.quizId + SEP + a.id < b.quizId + SEP + b.id ? -1 : 1));
}
const anyDue = (quizzes, now) => dueList(quizzes, now).length > 0;
// One quiz made of the given questions, each still pointing at the quiz it came from.
function todayQuiz(refs, quizzes) {
  const by = new Map(quizzes.map(q => [q.id, q])), questions = [], src = new Map();
  for (const { quizId, id } of refs) {
    const quiz = by.get(quizId), hit = quiz && getQ(quiz, id); if (!hit) continue;
    const vid = quizId + SEP + id;
    if (src.has(vid)) continue;
    questions.push(Object.assign({}, hit.q, { id: vid, fixedOpts: !!quiz.fixed || undefined }));
    src.set(vid, { quizId, id });
  }
  return { id: TODAY_ID, title: "Today", today: true, round: ROUND, sections: [{ title: "Today", questions }], src };
}
// The Today round: the due questions the most forgotten first, at most 7, with numbers questions cushioned (never first).
function buildTodayRound(quizzes, now = Date.now()) {
  const due = dueList(quizzes, now); if (!due.length) return null;
  const all = todayQuiz(due, quizzes), ids = cushion(all, all.sections[0].questions.map(q => q.id));
  return ids.map(vid => all.src.get(vid));
}
// Where a question's memory lives: a Today question points back at its own quiz.
const sourceOf = (quiz, id) => (quiz && quiz.src && quiz.src.get(id)) || { quizId: quiz.id, id };

export { FSRS7_W, GAP, DAY, RETAIN, AGAIN, HARD, GOOD, EASY, recall, step, interval, gradeOf, fsrsKey, loadMem, review,
  TODAY_ID, dueList, anyDue, todayQuiz, buildTodayRound, sourceOf };
