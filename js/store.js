/* Kiron: what this phone keeps. localStorage behind a safe wrapper, the quizzes you brought in, progress per quiz,
   and the ids that progress uses to point at questions. */
import { toast } from "./ui.js";

const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { saveFailed(); return false; } },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} }
};
const K_IMPORTED = "sb:imported";
// The phone's storage can be full or switched off (private browsing). Say so once, kindly, and carry on.
let saveWarned = false;
function saveFailed() { if (saveWarned) return; saveWarned = true; setTimeout(() => toast("Your progress can't be saved on this phone right now."), 0); }
const tapOnly = quiz => { try { return quiz.sections.every(s => s.questions.every(q => q.type === "single" || q.type === "multi" || q.type === "order" || q.mcq)); } catch (e) { return false; } };
// Kiron is tap-only: a quiz saved on this device before that, with typed questions that have no tap form, is left out.
const getImported = () => LS.get(K_IMPORTED, []).filter(tapOnly);
const saveImported = list => LS.set(K_IMPORTED, list);
const progKey = id => "sb:p2:" + id + ":early";   // ":early" is left from when there were two modes; kept so saved progress carries over
const blankProg = () => ({ st: {}, a: {}, h: {}, n: {}, round: null, cur: null, seen: 0 });
function getProg(id) { return Object.assign(blankProg(), LS.get(progKey(id), {})); }
// Question ids. A question that brings its own "id" (quiz format v2) is known by it, so rewording or moving it keeps its
// progress. A question without one is known by its place, s<part>q<question> (s0q12), as before.
const qid = (si, qi) => "s" + si + "q" + qi;
const POS = /^s(\d+)q(\d+)$/;
const stable = id => !POS.test(id);
const IDX = new WeakMap();
function index(quiz) {
  let m = IDX.get(quiz); if (m) return m;
  m = new Map();
  quiz.sections.forEach((s, si) => s.questions.forEach((q, qi) => { const id = q.id || qid(si, qi); m.set(id, { q, id, si, qi }); }));
  IDX.set(quiz, m); return m;
}
function eachQ(quiz, fn) { index(quiz).forEach(x => fn(x.q, x.id, x.si, x.qi)); }
function getQ(quiz, id) { return index(quiz).get(id); }
const hasQ = (quiz, id) => index(quiz).has(id);
// Saved progress points at questions by position (s0q12), so each saved question also keeps a fingerprint of what
// it asked. If the quiz file is edited later (a question added, removed, moved or reworded), progress follows each
// question to its new place; a question that is gone, or now asks something else, simply counts as not done yet.
// A question with its own id keeps its progress under that id even when it is reworded.
const FP = new WeakMap();
function prints(quiz) {
  let m = FP.get(quiz); if (m) return m;
  m = {};
  eachQ(quiz, (q, id) => {
    const s = [q.type, q.prompt, (q.options || q.items || []).join("\u0001"), q.correct, q.mcq ? q.mcq.prompt + "\u0001" + q.mcq.options.join("\u0001") + "\u0001" + q.mcq.correct : ""].join("\u0002");
    let a = 2166136261, b = 5381;
    for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); a = Math.imul(a ^ c, 16777619); b = (Math.imul(b, 33) + c) | 0; }
    m[id] = (a >>> 0).toString(36) + (b >>> 0).toString(36);
  });
  FP.set(quiz, m); return m;
}
function freshen(quiz, P) {
  const now = prints(quiz), old = P.fp;
  if (old && Object.keys(old).some(id => old[id] !== now[id])) {
    // Questions that have not moved keep their place; the others look for the same question elsewhere in the quiz.
    const free = {}, to = {};
    const kept = id => old[id] === now[id] || (stable(id) && id in old && id in now);
    for (const id in now) if (!kept(id)) (free[now[id]] = free[now[id]] || []).push(id);
    for (const id in old) to[id] = kept(id) ? id : (free[old[id]] || []).shift();
    ["st", "a", "h", "n"].forEach(k => { const was = P[k] || {}, o = {}; for (const id in was) { const t = id in to ? to[id] : hasQ(quiz, id) && !(id in old) ? id : ""; if (t) o[t] = was[id]; } P[k] = o; });
    // The round in hand was built from the old layout: drop it (answers so far are kept), so the next tap starts a fresh one.
    P.round = null; P.cur = null; P.fp = now; LS.set(progKey(quiz.id), P);
  }
  P.fp = now;
  const r = P.round;
  if (r && !(Array.isArray(r.ids) && r.ids.length && r.ids.every(id => hasQ(quiz, id)))) { P.round = null; P.cur = null; }
  if (P.cur && !hasQ(quiz, P.cur.id)) P.cur = null;
  return P;
}

export { LS, K_IMPORTED, tapOnly, getImported, saveImported, progKey, blankProg, getProg, qid, eachQ, getQ, hasQ, prints, freshen };
