/* Kiron: how a round is made and marked. Which questions come next, the order of options, grading, and the time
   each question gets. No page here: plain logic, tested in tests/. */
import { eachQ, getQ } from "./store.js";

const ROUND = 7;
function shuffledOrder(seedStr, n) {
  const idx = [...Array(n).keys()];
  let seed = 0; for (const ch of seedStr) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0; seed = seed || 7;
  for (let i = n - 1; i > 0; i--) { seed = (seed * 1103515245 + 12345) >>> 0; const j = (seed >>> 8) % (i + 1); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  return idx;
}
function orderStart(id, n) { const o = shuffledOrder(id, n); if (o.every((v, i) => v === i)) o.reverse(); return o; }
// How a question is shown. Everything is tap-to-answer: "single" as it is; older typed questions ("text", "number")
// through their tap form ("mcq"); "multi" and "order" as themselves.
function formOf(q) {
  if (q.type === "single") return { kind: "pick", prompt: q.prompt, options: q.options, correct: q.correct, why: q.answer, more: "" };
  if (q.mcq) return { kind: "pick", prompt: q.mcq.prompt || q.prompt, options: q.mcq.options, correct: q.mcq.correct, why: q.mcq.why || q.answer, more: q.mcq.why ? q.answer : "", setup: q.type === "number" && !q.mcq.prompt };
  return { kind: q.type, prompt: q.prompt };
}
function gradeMulti(q, v) { const sel = new Set(v || []), cor = new Set(q.correct); let g = 0, b = 0; sel.forEach(i => cor.has(i) ? g++ : b++); if (g === cor.size && !b) return "right"; return (g - b) / cor.size >= 0.5 ? "partial" : "miss"; }
function gradeOrder(q, ord) { let k = 0; ord.forEach((it, i) => { if (it === i) k++; }); return k === q.items.length ? "right" : (k / q.items.length >= 0.5 ? "partial" : "miss"); }
function counts(quiz, P, si) {
  const c = { right: 0, revisit: 0, skip: 0, left: 0, total: 0 };
  eachQ(quiz, (q, id, s) => { if (si !== undefined && s !== si) return; c.total++; const v = P.st[id]; if (v === "right") c.right++; else if (v === "partial" || v === "miss") c.revisit++; else if (v === "skip") c.skip++; else c.left++; });
  return c;
}
const MAXNUM = 3;
// A numbers question: the older typed "number" kind, or any question tagged "calc" (how quizzes mark them now).
const isNumQ = q => q.type === "number" || (q.tags || []).includes("calc");
function cushion(quiz, list) {
  // At most MAXNUM number questions per round, never first, spread out between easier ones.
  const isNum = id => isNumQ(getQ(quiz, id).q), R = quiz.round || ROUND;
  const T = [], N = [], skipped = [];
  for (const id of list) {
    if (T.length + N.length >= R) break;
    if (isNum(id)) { if (N.length < MAXNUM) N.push(id); else skipped.push(id); } else T.push(id);
  }
  while (T.length + N.length < R && skipped.length && T.length === 0) N.push(skipped.shift()); // only numbers left
  const out = []; let ti = 0;
  N.forEach((n, k) => { const want = Math.max(k + 1, Math.round((k + 1) * T.length / (N.length + 1))); while (ti < want && ti < T.length) out.push(T[ti++]); out.push(n); });
  while (ti < T.length) out.push(T[ti++]);
  return out;
}
function buildRound(quiz, P, opt) {
  opt = opt || {};
  const all = []; eachQ(quiz, (q, id, si) => { if (opt.only === undefined || si === opt.only) all.push({ id, si }); });
  const pick = (test, from) => { let list = all.filter(x => test(P.st[x.id])); if (from !== undefined) { const a = list.filter(x => x.si >= from), b = list.filter(x => x.si < from); list = a.concat(b); } return cushion(quiz, list.map(x => x.id)); };
  let ids = [], kind = "new";
  if (opt.kind === "revisit") { ids = pick(v => v === "miss" || v === "partial", opt.from); kind = "revisit"; }
  else {
    ids = pick(v => !v, opt.from);
    if (!ids.length) { ids = pick(v => v === "skip"); kind = "skipped"; }
    if (!ids.length) { ids = pick(v => v === "miss" || v === "partial"); kind = "revisit"; }
  }
  if (!ids.length) return null;
  ids.forEach(id => { delete P.a[id]; delete P.h[id]; P.n[id] = (P.n[id] || 0) + 1; });
  return { ids, i: 0, res: {}, kind, streak: 0, ended: false, only: opt.only };
}
function buildReview(quiz, P, si) {
  const ids = []; eachQ(quiz, (q, id, s) => { if (s === si && (P.st[id] === "right" || P.st[id] === "partial" || P.st[id] === "miss")) ids.push(id); });
  if (!ids.length) return null;
  const res = {}; ids.forEach(id => { res[id] = P.st[id]; });
  return { ids, i: 0, res, kind: "review", streak: 0, ended: false, review: true };
}
/* ---- auto-advance timer: the story bar fills over the question; when full, the question is left for later (never marked wrong) ---- */
// Time per question scales with how much there is to read: 12s thinking + 0.35s per word, at least 20s, at most 60s (ordering and multi-select x1.5).
const TIME = { base: 12000, perWord: 350, min: 20000, max: 60000, mult: { multi: 1.5, order: 1.5 }, fixed: null };
function durFor(q, f) {
  if (TIME.fixed) return TIME.fixed;
  const parts = [f.prompt || "", ...(f.options || q.options || q.items || [])].join(" ").replace(/<[^>]*>/g, " ");
  const words = (parts.match(/\S+/g) || []).length;
  const ms = Math.min(TIME.max, Math.max(TIME.min, TIME.base + words * TIME.perWord));
  return Math.round(ms * (TIME.mult[f.kind] || 1));
}

export { ROUND, shuffledOrder, orderStart, formOf, gradeMulti, gradeOrder, counts, MAXNUM, isNumQ, cushion, buildRound, buildReview, TIME, durFor };
