/* Kiron: the Socratic tutor loop (Kiron 1.9.0), tap-only. No page here: plain logic, tested in tests/socratic.test.js.
   - A skill level 0-5 for each part (section) of a quiz, kept in its progress as P.sk[<part id>] = { lv, ok, spaced }.
   - The placement round: a short first round of the questions a quiz marks "diagnostic", one per part where it can.
   - When a wrong pick gets a contradiction probe, and when a right pick gets a devil's advocate check.
   Levels: 0 not seen; 1 seen or placed; 2 right with help (a hint, a burn, a probe); 3 right on your own; 4 right on
   your own on 2 or more checks, at least one of them a spaced look (12 hours or more after the last); 5 a hardest
   (difficulty 4) question right on a spaced look, with its devil's advocate passed. A miss on a spaced look drops a
   level of 3 or more by one, quietly. Nothing here is ever shown as a number. */
import { eachQ } from "./store.js";
import { cushion } from "./round.js";

const SPACED_DAYS = 0.5, DA_CHANCE = 0.4, PROBE_TRIES = 2, DIAG_MIN = 3, DIAG_MAX = 5;

// The placement round, for a quiz that marks diagnostic questions and has nothing answered yet: one per part (the
// first one each part marks), up to 5, topped up to 3 from the parts that mark more. Numbers questions never first.
function buildDiagnostic(quiz, P) {
  if (P.diagDone || Object.keys(P.st || {}).length) return null;
  const by = quiz.sections.map(() => []);
  eachQ(quiz, (q, id, si) => { if (q.diagnostic) by[si].push(id); });
  const ids = by.filter(l => l.length).map(l => l[0]).slice(0, DIAG_MAX);
  if (!ids.length) return null;
  for (const l of by) for (const id of l.slice(1)) if (ids.length < DIAG_MIN) ids.push(id);
  return { ids: cushion(Object.assign({}, quiz, { round: DIAG_MAX }), ids), i: 0, res: {}, kind: "diag", streak: 0, ended: false };
}

// One answer's effect on its part's level. ev: { right, helped, spaced, edge, diag }.
//   right: answered right on the first pick.   helped: right only with a hint, a burn or a probe.
//   spaced: 12 hours or more since this question was last seen.   edge: a difficulty 4 question with its devil's
//   advocate passed.   diag: from the placement round (right places the part at 2, a miss at 1).
function learn(sk, ev) {
  const s = Object.assign({ lv: 0, ok: 0, spaced: false }, sk);
  if (ev.diag) { s.lv = Math.max(s.lv, ev.right ? 2 : 1); return s; }
  if (!ev.right && !ev.helped) {
    // A miss on a spaced look steps a settled part down one, and it has to show itself again to climb back.
    if (ev.spaced && s.lv >= 3) { s.lv--; s.ok = 0; s.spaced = false; } else s.lv = Math.max(s.lv, 1);
    return s;
  }
  if (ev.helped) { s.lv = Math.max(s.lv, 2); return s; }
  s.ok++; if (ev.spaced) s.spaced = true;
  s.lv = Math.max(s.lv, 3);
  if (s.ok >= 2 && s.spaced) s.lv = Math.max(s.lv, 4);
  if (s.lv >= 4 && ev.spaced && ev.edge) s.lv = 5;
  return s;
}
const isSpaced = (last, now = Date.now()) => !!last && (now - last) / 864e5 >= SPACED_DAYS;

// What a pick does on a question still open. cur = { tries } (wrong picks so far on it). teach = probes may show
// (not in the placement round, nor in review).
//   "right": right first time.   "corrected": right after a probe.   "probe": wrong, and a probe for that option
//   comes up (at most PROBE_TRIES of them).   "miss": wrong, with nothing more to ask; the answer is shown.
function onPick(q, f, cur, oi, teach) {
  if (oi === f.correct) return cur && cur.tries ? "corrected" : "right";
  return teach && probeFor(q, oi, cur ? cur.tries || 0 : 0) ? "probe" : "miss";
}
const probeFor = (q, oi, tries) => (tries < PROBE_TRIES && q.probes && q.probes[oi]) || null;
// About 4 in 10 right picks on a question with a devil's advocate get it, to keep the pace brisk.
const daFires = (q, rnd = Math.random) => !!q.da && rnd() < DA_CHANCE;
// "Just tell me": whatever is open, the question ends here and its answer is shown.
const tellMe = () => "miss";

export { SPACED_DAYS, DA_CHANCE, PROBE_TRIES, buildDiagnostic, learn, isSpaced, onPick, probeFor, daFires, tellMe };
