/* Kiron quiz player: static, no server. Quizzes are JSON; progress lives in this browser. */
(function () {
"use strict";

/* ---------------- storage ---------------- */
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { saveFailed(); return false; } },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} }
};
const K_IMPORTED = "sb:imported";
// The phone's storage can be full or switched off (private browsing). Say so once, kindly, and carry on.
let saveWarned = false;
function saveFailed() { if (saveWarned) return; saveWarned = true; setTimeout(() => toast("Your progress can't be saved on this phone right now."), 0); }

/* ---------------- helpers ---------------- */
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// Text formatting (maths, **bold**, *italic*, line breaks) lives in maths.js: fmt().
const slug = s => String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "quiz";
let toastT;
let toastHeld = false;
// onTap: the toast stays until tapped, and the tap does that one thing (used for "tap to reload").
function toast(msg, onTap) {
  if (toastHeld && !onTap) return;
  let t = $("#toast");
  if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; t.setAttribute("role", "status"); document.body.append(t); }
  t.textContent = msg; t.hidden = false; t.onclick = onTap || null; t.classList.toggle("tap", !!onTap); toastHeld = !!onTap;
  clearTimeout(toastT); if (!onTap) toastT = setTimeout(() => { t.hidden = true; }, 2600);
}
/* ---------------- safety net ----------------
   If anything in the app breaks, a button must never just go dead: say so kindly and offer a reload. Progress is
   already saved after every answer, so a reload loses nothing. The last problem is kept for bug reports. */
const TROUBLE = { last: "", quizzes: [] };
function wentOff(what) {
  const text = String(what && (what.stack || what.message) || what || "unknown").slice(0, 600);
  if (/ResizeObserver loop/.test(text)) return;
  TROUBLE.last = text; try { console.error("[Kiron]", text); } catch (e) {}
  if (toastHeld) return;
  try { toast("Something went off. Tap to reload.", () => location.reload()); } catch (e) {}
}
window.addEventListener("error", e => { if (e.error || e.message) wentOff(e.error || e.message); });
window.addEventListener("unhandledrejection", e => wentOff(e.reason));
/* ---------------- validation ---------------- */
const TYPES = ["text", "single", "multi", "number", "order"];
const TYPE_ALIASES = { mcq: "single", choice: "single", radio: "single", checkbox: "multi", multiple: "multi", num: "number", numeric: "number", calc: "number", calculation: "number", typed: "text", open: "text", short: "text", rank: "order", sequence: "order" };

function validateQuiz(d) {
  const errs = [];
  if (!d || typeof d !== "object" || Array.isArray(d)) return { errors: ["The quiz must be one object that starts with { and has a title and sections."] };
  const isStr = v => typeof v === "string" && v.trim() !== "";
  const out = {
    format: "study-buddy-quiz", version: 1,
    title: isStr(d.title) ? d.title.trim() : "",
    source: isStr(d.source) ? d.source.trim() : "",
    sourceUrl: isStr(d.sourceUrl) && /^https?:\/\//.test(d.sourceUrl.trim()) ? d.sourceUrl.trim() : "",
    purpose: isStr(d.purpose) ? d.purpose.trim() : "",
    about: isStr(d.about) ? d.about.trim() : "",
    sections: []
  };
  if (!out.title) errs.push("The quiz needs a “title”.");
  out.id = slug(isStr(d.id) ? d.id : out.title);
  let secs = d.sections;
  if (!Array.isArray(secs) && Array.isArray(d.questions)) secs = [{ title: "Questions", questions: d.questions }];
  if (!Array.isArray(secs) || !secs.length) { errs.push("The quiz needs “sections”: a list with at least one section, each with “questions”."); return { errors: errs }; }
  let total = 0;
  secs.forEach((sec, si) => {
    const sname = "Section " + (si + 1) + (sec && isStr(sec.title) ? " (“" + sec.title.trim().slice(0, 40) + "”)" : "");
    if (!sec || typeof sec !== "object") { errs.push(sname + " is not a section object."); return; }
    const S = { title: isStr(sec.title) ? sec.title.trim() : "Part " + (si + 1), ref: isStr(sec.ref) ? sec.ref.trim() : "", why: isStr(sec.why) ? sec.why.trim() : "", questions: [] };
    if (!Array.isArray(sec.questions) || !sec.questions.length) { errs.push(sname + " has no “questions” list."); return; }
    sec.questions.forEach((q, qi) => {
      const where = sname + ", question " + (qi + 1);
      if (!q || typeof q !== "object") { errs.push(where + " is not a question object."); return; }
      let type = String(q.type || "").toLowerCase().trim();
      type = TYPE_ALIASES[type] || type;
      if (!type) type = Array.isArray(q.options) ? (Array.isArray(q.correct) ? "multi" : "single") : Array.isArray(q.items) ? "order" : typeof q.correct === "number" ? "number" : "text";
      if (!TYPES.includes(type)) { errs.push(where + ": unknown “type” “" + q.type + "”. Use one of: " + TYPES.join(", ") + "."); return; }
      const Q = { type, prompt: isStr(q.prompt) ? q.prompt.trim() : (isStr(q.question) ? q.question.trim() : ""), hint: isStr(q.hint) ? q.hint.trim() : "", answer: isStr(q.answer) ? q.answer.trim() : isStr(q.why) ? q.why.trim() : (isStr(q.explanation) ? q.explanation.trim() : ""), ref: isStr(q.ref) ? q.ref.trim() : "" };
      Q.tags = (Array.isArray(q.tags) ? q.tags : (isStr(q.tags) ? [q.tags] : [])).map(t => String(t).toLowerCase().trim()).map(t => t === "disc" ? "discussion" : t === "calculation" ? "calc" : t).filter(t => t === "calc" || t === "discussion");
      if (!Q.prompt) errs.push(where + " has no “prompt” (the question text).");
      if (!Q.answer) errs.push(where + " has no “answer” (the model answer or explanation shown after checking).");
      if (type === "single" || type === "multi") {
        const opts = Array.isArray(q.options) ? q.options.map(o => String(o == null ? "" : o).trim()) : [];
        if (opts.length < 2 || opts.some(o => !o)) { errs.push(where + ": “options” needs at least two non-empty choices."); return; }
        Q.options = opts;
        const toIdx = c => {
          if (typeof c === "number" && Number.isInteger(c)) return c;
          if (typeof c === "string") {
            const t = c.trim();
            if (/^\d+$/.test(t)) return +t;
            if (/^[A-Za-z]$/.test(t)) return t.toUpperCase().charCodeAt(0) - 65;
            const i = opts.findIndex(o => o.toLowerCase() === t.toLowerCase());
            if (i >= 0) return i;
          }
          return NaN;
        };
        let c = q.correct;
        if (c === undefined) c = q.answerIndex;
        const range = "this question has " + opts.length + " options, so 0 to " + (opts.length - 1);
        if (type === "single") {
          if (Array.isArray(c) && c.length === 1) c = c[0];
          const i = toIdx(c);
          if (!(i >= 0 && i < opts.length)) errs.push(where + ": “correct” must be the number of the right option, counting from 0 (" + range + ").");
          Q.correct = i;
        } else {
          if (!Array.isArray(c)) c = c === undefined ? [] : [c];
          const ids = [...new Set(c.map(toIdx))];
          if (!ids.length || ids.some(i => !(i >= 0 && i < opts.length))) errs.push(where + ": “correct” must be a list of the right options' numbers, counting from 0 (" + range + ").");
          Q.correct = ids.sort((a, b) => a - b);
        }
      } else if (type === "order") {
        const items = Array.isArray(q.items) ? q.items.map(x => String(x == null ? "" : x).trim()) : [];
        if (items.length < 2 || items.some(x => !x)) { errs.push(where + ": “items” needs at least two entries, listed in the correct order."); return; }
        Q.items = items;
      }
      if (q.mcq !== undefined && q.mcq !== null) {
        const m = q.mcq, mo = m && Array.isArray(m.options) ? m.options.map(o => String(o == null ? "" : o).trim()) : [];
        if (!m || typeof m !== "object" || mo.length < 2 || mo.some(o => !o)) errs.push(where + ": the tap-to-answer form (“mcq”) needs “options” with at least two non-empty choices.");
        else {
          let c = m.correct, i = NaN;
          if (typeof c === "number" && Number.isInteger(c)) i = c;
          else if (typeof c === "string") { const t = c.trim(); i = /^\d+$/.test(t) ? +t : /^[A-Za-z]$/.test(t) ? t.toUpperCase().charCodeAt(0) - 65 : mo.findIndex(o => o.toLowerCase() === t.toLowerCase()); }
          if (!(i >= 0 && i < mo.length)) errs.push(where + ": in “mcq”, “correct” must be the number of the right option, counting from 0 (there are " + mo.length + " options, so 0 to " + (mo.length - 1) + ").");
          else Q.mcq = { prompt: isStr(m.prompt) ? m.prompt.trim() : "", options: mo, correct: i, why: isStr(m.why) ? m.why.trim() : "" };
        }
      } else if (type === "text" || type === "number") errs.push(where + ": Kiron is tap-to-answer only. Make it a “single” question with four “options” (or give it an “mcq” with options).");
      S.questions.push(Q); total++;
    });
    out.sections.push(S);
  });
  if (!errs.length && !total) errs.push("The quiz has no questions.");
  return errs.length ? { errors: errs } : { quiz: out };
}

/* ---------------- quiz library ---------------- */
let SAMPLES = [];   // [{file, quiz}]
let samplesLoaded = false;
// Kiron is tap-only: a quiz saved on this device before that, with typed questions that have no tap form, is left out.
const tapOnly = quiz => { try { return quiz.sections.every(s => s.questions.every(q => q.type === "single" || q.type === "multi" || q.type === "order" || q.mcq)); } catch (e) { return false; } };
const getImported = () => LS.get(K_IMPORTED, []).filter(tapOnly);
function allQuizzes() {
  const imp = getImported().map(q => ({ quiz: q, mine: true }));
  const ids = new Set(imp.map(x => x.quiz.id));
  return imp.concat(SAMPLES.filter(s => !ids.has(s.quiz.id)).map(s => ({ quiz: s.quiz, mine: false })))
    .sort((a, b) => a.quiz.title.localeCompare(b.quiz.title, undefined, { sensitivity: "base", numeric: true }));
}
function findQuiz(id) { return allQuizzes().find(x => x.quiz.id === id); }
// A quiz file that can't be read is left out of the list, and the reason is written to the console and kept in SB.trouble.
function badQuiz(file, errors) { TROUBLE.quizzes.push({ file, errors }); try { console.warn("[Kiron] quiz left out: " + file + "\n  " + (errors || []).join("\n  ")); } catch (e) {} }
// net = ask the network first (the quiet check for new quizzes); otherwise the saved copy answers at once.
async function fetchSamples(net) {
  const q = net ? "?net=1" : "";
  const r = await fetch("quizzes.json" + q, { cache: "no-cache" });
  const list = await r.json();
  const got = await Promise.all((list.quizzes || []).map(async f => {
    try {
      const res = await fetch(f + q);
      if (!res.ok) { if (!net) badQuiz(f, ["could not be fetched (" + res.status + ")"]); return null; }
      const text = await res.text(), v = validateQuiz(JSON.parse(text)); if (v.quiz) return { file: f, quiz: v.quiz, text };
      if (!net) badQuiz(f, v.errors);
    } catch (e) { if (!net) badQuiz(f, [e && e.message || String(e)]); else if (!(e instanceof SyntaxError)) throw e; }
    return null;
  }));
  return got.filter(Boolean);
}
async function loadSamples() {
  try { SAMPLES = await fetchSamples(false); } catch (e) { SAMPLES = []; }
  samplesLoaded = true;
}
// The list above came straight from this phone's saved copy, so it shows at once. Then, quietly, look for newer
// quizzes. They are swapped in only while the person is not inside a round.
let FRESH = null;
const sig = list => list.map(x => x.file + "\n" + x.text).join("\n\n");
async function checkFresh() {
  try { const got = await fetchSamples(true); if (got.length && sig(got) !== sig(SAMPLES)) { FRESH = got; takeFresh(); } } catch (e) {}
}
function takeFresh() {
  if (!FRESH || /^#play-/.test(location.hash)) return false;
  SAMPLES = FRESH; FRESH = null;
  if (!location.hash || location.hash === "#") renderLibrary();
  return true;
}

/* ---------------- progress + grading ---------------- */
const ROUND = 7;
const progKey = id => "sb:p2:" + id + ":early";   // ":early" is left from when there were two modes; kept so saved progress carries over
const blankProg = () => ({ st: {}, a: {}, h: {}, n: {}, round: null, cur: null, seen: 0 });
function getProg(id) { return Object.assign(blankProg(), LS.get(progKey(id), {})); }
function saveProg() { if (!current) return; current.P.seen = Date.now(); LS.set(progKey(current.quiz.id), current.P); }
const qid = (si, qi) => "s" + si + "q" + qi;
function eachQ(quiz, fn) { quiz.sections.forEach((s, si) => s.questions.forEach((q, qi) => fn(q, qid(si, qi), si, qi))); }
function getQ(quiz, id) { const m = id.match(/^s(\d+)q(\d+)$/); const si = +m[1], qi = +m[2]; return { q: quiz.sections[si].questions[qi], id, si, qi }; }
const hasQ = (quiz, id) => { const m = /^s(\d+)q(\d+)$/.exec(id || ""); return !!(m && quiz.sections[+m[1]] && quiz.sections[+m[1]].questions[+m[2]]); };
// Saved progress points at questions by position (s0q12), so each saved question also keeps a fingerprint of what
// it asked. If the quiz file is edited later (a question added, removed, moved or reworded), progress follows each
// question to its new place; a question that is gone, or now asks something else, simply counts as not done yet.
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
    for (const id in now) if (old[id] !== now[id]) (free[now[id]] = free[now[id]] || []).push(id);
    for (const id in old) to[id] = old[id] === now[id] ? id : (free[old[id]] || []).shift();
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
function cushion(quiz, list) {
  // At most MAXNUM number questions per round, never first, spread out between easier ones.
  const isNum = id => getQ(quiz, id).q.type === "number";
  const T = [], N = [], skipped = [];
  for (const id of list) {
    if (T.length + N.length >= ROUND) break;
    if (isNum(id)) { if (N.length < MAXNUM) N.push(id); else skipped.push(id); } else T.push(id);
  }
  while (T.length + N.length < ROUND && skipped.length && T.length === 0) N.push(skipped.shift()); // only numbers left
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

/* ---------------- routing ---------------- */
const hasSW = "serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost");
let UPDATE = false;   // a newer version of the app is saved and waiting
// Reload into the waiting version, but only on the library (hash = the one place it may happen while on screen) or out of sight, and never inside a round.
function updateIfWaiting(hash) {
  if (!UPDATE || /^#play-/.test(location.hash)) return false;
  if (hash !== undefined && (location.hash || "").replace(/^#/, "") !== hash) return false;
  UPDATE = false; location.reload(); return true;
}
let current = null; // { quiz, mine, P }
const app = () => $("#app");
function openQuiz(id) {
  const found = findQuiz(id); if (!found) return null;
  current = { quiz: found.quiz, mine: found.mine, P: freshen(found.quiz, getProg(found.quiz.id)) };
  return current;
}
function route() {
  clearTimer();
  if (!/^#play-/.test(location.hash)) { if (updateIfWaiting("")) return; if (FRESH) { SAMPLES = FRESH; FRESH = null; } }
  if (!/^#play-/.test(location.hash)) {
    clearFeed();
    // Leaving the quiz ends the streak.
    if (current && current.P.round && current.P.round.streak) { current.P.round.streak = 0; saveProg(); }
  }
  document.documentElement.classList.toggle("on-play", /^#play-/.test(location.hash));
  const h = decodeURIComponent((location.hash || "").replace(/^#/, ""));
  if (h === "import" || h === "make") return renderExtra(h);
  const m = h.match(/^(quiz|play)-(.+)$/);
  if (m) {
    if (openQuiz(m[2])) return m[1] === "play" ? renderPlay() : renderHome();
    if (!samplesLoaded) return;
    toast("That quiz isn't on this device. Import it first.");
  }
  renderLibrary();
}
// rep = replace the history entry instead of adding one, so Back from a round goes to the library, not round -> home -> round -> home.
function go(h, rep) { if (location.hash === "#" + h || (!h && !location.hash)) { route(); window.scrollTo(0, 0); } else if (rep) location.replace(location.pathname + location.search + "#" + h); else location.hash = h; }
window.addEventListener("hashchange", () => { cancelScroll(); route(); window.scrollTo(0, 0); flowIn(); });
/* ---- Kiron 1.4.1: the library and a quiz's first screen flow into each other. Only for a tap between those two still
   screens, never into or out of a round. The new screen is drawn first, as always; then it fades up once, and the quiz
   title glides in from the side of the card you tapped. Transform and opacity only, played once, nothing redrawn while it runs. ---- */
let FLOW = null;
function flowFrom(t) {
  FLOW = null;
  if (/^#play-/.test(location.hash) || reduceMotion() || !t.animate) return;
  const h = t.classList.contains("qcard") && t.querySelector("h3");
  FLOW = { at: Date.now(), r: h ? h.getBoundingClientRect() : null };
}
function flowIn() {
  const f = FLOW; FLOW = null;
  if (!f || Date.now() - f.at > 400 || /^#play-/.test(location.hash)) return;
  const main = app().querySelector("main.lib, main.home"); if (!main) return;
  const rise = { duration: 380, easing: "cubic-bezier(.25,.6,.3,1)" }, from = { opacity: 0, transform: "translateY(10px)" }, to = { opacity: 1, transform: "none" };
  const title = f.r && main.querySelector(".qtitle");
  if (!title) { main.animate([from, to], rise); return; }
  // The title comes in from the side of the card you tapped. A short glide, not the whole way: the full path would cross the big button.
  const r = title.getBoundingClientRect(), lim = (v, m) => Math.max(-m, Math.min(m, v));
  const dx = lim(f.r.left + f.r.width / 2 - (r.left + r.width / 2), 36), dy = lim(f.r.top + f.r.height / 2 - (r.top + r.height / 2), 28);
  title.animate([{ opacity: 0, transform: `translate(${dx.toFixed(1)}px,${dy.toFixed(1)}px) scale(.86)` }, { opacity: 1, transform: "none" }], { duration: 460, easing: "cubic-bezier(.32,.72,0,1)" });
  [...main.children].forEach(k => { if (k !== title) k.animate([from, to], rise); });
}
const topBar = (left, title, right) => `<header class="top"><div class="top-in">${left || ""}${title}${right || ""}</div></header>`;
const backBtn = (to, label) => `<button class="icon-btn" data-go="${to || ""}" aria-label="${label || "Back to library"}" type="button">←</button>`;
/* ---- Kiron 1.4.4: haptics. A web page on an iPhone cannot ask for a vibration, but the phone itself gives a tick when a
   finger flips a real iOS switch. So each button carries an invisible switch stretched over it: the finger lands on the
   switch, the phone ticks, and the tap carries on to the button as always. Where there is no tick (older phones, laptops)
   nothing else changes. Kept off the long scrolling lists (the quiz list and the parts under "Jump to a part"): a finger
   that lands on a switch and drags may move the switch instead of the page. Also kept off anything that cannot be pressed.
   Android phones have a real vibration call, so they get a short buzz, a double one for a right answer and one when a streak lands. ---- */
const HX = `<input class="hx" type="checkbox" switch tabindex="-1" aria-hidden="true">`;
const hxAll = html => html.replace(/<button\b([^>]*)>([\s\S]*?)<\/button>/g, (m, at, inner) => /qcard|part-row|data-pi=|aria-disabled="true"|\sdisabled\b/.test(at) ? m : `<button${at}>${inner}${HX}</button>`);
const buzz = p => { if (navigator.vibrate) try { navigator.vibrate(p); } catch (e) {} };
/* ---------------- library: just the list ---------------- */
function renderLibrary() {
  current = null; document.title = "Kiron";
  const list = allQuizzes();
  app().innerHTML = topBar("", `<div class="brand"><img src="icon-192.png" alt="">Kiron</div>`) + `
  <main class="wrap lib">
    <h1 class="pick">Pick your quiz</h1>
    <div class="grid">${list.length ? list.map(x => `<button class="qcard" data-go="quiz-${esc(x.quiz.id)}" type="button"><h3>${esc(x.quiz.title)}</h3><span class="chev" aria-hidden="true">›</span></button>`).join("") : `<p class="empty">${samplesLoaded ? "No quizzes yet." : "Loading…"}</p>`}</div>
    <p class="credit">Made by Pranjal Parashar</p>
  </main>`;
}
/* ---------------- quiz home: one button, a hidden part list, reset ---------------- */
function renderHome() {
  const { quiz, P, mine } = current;
  document.title = quiz.title + " · Kiron";
  const c = counts(quiz, P), started = c.left < c.total;
  const inRound = P.round && !P.round.ended && P.round.i < P.round.ids.length;
  let primary;
  if (inRound) primary = `<button class="btn primary xl" data-act="resume" type="button">Continue</button>`;
  else if (c.left) primary = `<button class="btn primary xl" data-act="start" type="button">${started ? "Continue" : "Start"}</button>`;
  else if (c.skip) primary = `<button class="btn primary xl" data-act="start" type="button">Do the ones you left</button>`;
  else if (c.revisit) primary = `<button class="btn primary xl" data-act="revisit" type="button">Revisit what you missed</button>`;
  else primary = `<div class="donebox"><b>End of quiz.</b></div>`;
  const stateOf = pc => !pc.total || pc.left === pc.total ? ["none", "Not started"] : pc.left === 0 && pc.skip === 0 ? ["done", "Done"] : ["some", "In progress"];
  const parts = quiz.sections.map((s, i) => {
    const pc = counts(quiz, P, i), st = stateOf(pc), answered = pc.right + pc.revisit > 0;
    const acts = st[0] === "none" ? `<button class="btn primary" data-act="partstart" data-pi="${i}" type="button">Start</button>`
      : `${st[0] === "some" ? `<button class="btn primary" data-act="partstart" data-pi="${i}" type="button">Continue</button>` : ""}${answered ? `<button class="btn" data-act="partreview" data-pi="${i}" type="button">Review</button>` : ""}<button class="btn ghost" data-act="partredo" data-pi="${i}" type="button">Redo</button>`;
    return `<div class="part"><div class="part-head"><button class="part-row" type="button" data-act="partopen" aria-expanded="false"><span class="pdot s-${st[0]}" aria-hidden="true"></span><b>${esc(s.title)}</b><span class="pstate s-${st[0]}">${st[1]}</span></button></div><div class="unfurl" inert><div class="fold"><div class="fold-in"><div class="unfurl-in"><div class="pact">${acts}</div></div></div></div></div><i class="cap" aria-hidden="true"></i></div>`;
  }).join("");
  app().innerHTML = hxAll(topBar(backBtn(), `<span class="grow"></span>`) + `
  <main class="wrap home">
    <h1 class="qtitle">${esc(quiz.title)}</h1>
    <div class="cta">${primary}${c.revisit && (inRound || c.left || c.skip) ? `<button class="btn" data-act="revisit" type="button">Revisit what you missed</button>` : ""}</div>
    ${quiz.sections.length > 1 ? `<div class="jump"><div class="jump-head"><button class="jump-btn" type="button" data-act="jump" aria-expanded="false">Jump to a part<span class="car" aria-hidden="true">▾</span></button></div><div class="unfurl" inert><div class="fold"><div class="fold-in"><div class="parts">${parts}</div></div></div></div><i class="cap" aria-hidden="true"></i></div>` : ""}
    <div class="foot">${started || inRound ? `<button class="btn ghost danger" data-act="reset" type="button">Reset quiz</button>` : ""}${mine ? `<button class="btn ghost danger" data-del="${esc(quiz.id)}" type="button">Delete this quiz</button>` : ""}</div>
  </main>`);
}
function startRound(opt) {
  const { quiz, P } = current;
  // Carrying on in order straight from the end of a round keeps the streak going; anything else starts fresh.
  const carry = P.round && P.round.ended && !P.round.review ? P.round.streak || 0 : 0;
  const r = buildRound(quiz, P, opt);
  if (!r) { toast("Nothing left there. Nice."); return; }
  if (!opt || opt.kind !== "revisit") r.streak = carry;
  r.best = r.streak || 0;
  P.round = r; P.cur = null; saveProg(); go("play-" + quiz.id, true);
}

/* ---------------- player: one question per screen ---------------- */
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
let TIMER = null;   // { id, dur, t0, pausedAt, to }
// The timer always plays by default. Pause holds only the question you are on; the next question starts playing again.
let PAUSED = false;
function clearTimer() { if (TIMER) { clearTimeout(TIMER.to); TIMER = null; } }
function timerElapsed() { return TIMER ? (TIMER.pausedAt || Date.now()) - TIMER.t0 : 0; }
function armTimer() {
  if (!TIMER) return; clearTimeout(TIMER.to);
  if (document.hidden || PAUSED) { if (!TIMER.pausedAt) TIMER.pausedAt = Date.now(); return; }
  if (TIMER.pausedAt) { TIMER.t0 += Date.now() - TIMER.pausedAt; TIMER.pausedAt = 0; }
  TIMER.to = setTimeout(() => {
    if (!current || !current.P.round || !TIMER) return;
    const r = current.P.round, id = TIMER.id;
    if (r.ended || r.ids[r.i] !== id || (current.P.cur && current.P.cur.done)) return;
    if (dragging) { TIMER.t0 = Date.now() - TIMER.dur + 1500; return armTimer(); }   // never change question under a held row
    nav(1);
  }, Math.max(0, TIMER.dur - timerElapsed()));
}
document.addEventListener("visibilitychange", () => {
  if (!TIMER) return; const dots = document.querySelector(".dots");
  if (document.hidden) { if (!TIMER.pausedAt) TIMER.pausedAt = Date.now(); clearTimeout(TIMER.to); if (dots) dots.classList.add("paused"); }
  else if (!PAUSED) { if (TIMER.pausedAt) { TIMER.t0 += Date.now() - TIMER.pausedAt; TIMER.pausedAt = 0; } if (dots) dots.classList.remove("paused"); armTimer(); }
});
let FX = null;      // one-shot effect for the next render: { kind: "right" | "wrong" | "mixed", oi }
let DIR = 0;        // which way we just moved: 1 = forward, -1 = back (for the slide-in)
const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
function renderPlay(keepScroll) {
  endDrag();
  const { quiz, P } = current;
  const r = P.round;
  if (!r) return go("quiz-" + quiz.id, true);
  document.title = quiz.title + " · Kiron";
  if (r.ended || r.i >= r.ids.length) return renderRoundEnd();
  const y0 = window.scrollY;
  const { q, id } = getQ(quiz, r.ids[r.i]);
  if (!P.cur || P.cur.id !== id) {
    const was = r.res[id];
    P.cur = was && was !== "skip" ? { id, done: true, status: was } : { id, done: false };
  }
  const cur = P.cur, f = formOf(q);
  const fx = FX && FX.id === id ? FX : null; FX = null;
  // Pause keeps the timer where it is: the bar freezes and Play carries on from the same spot.
  const timedDur = !cur.done && !r.review ? durFor(q, f) : 0;
  if (timedDur) { if (!TIMER || TIMER.id !== id) { clearTimer(); const now = Date.now(); PAUSED = false; TIMER = { id, dur: timedDur, t0: now, pausedAt: 0, to: null }; } } else clearTimer();
  const dots = r.ids.map((x, i) => `<i class="${i < r.i ? (r.res[x] === "skip" ? "skip" : "past") : i === r.i ? "now" + (cur.done ? " full" : timedDur ? " timing" : "") : ""}"${i === r.i && timedDur ? ` style="--dur:${timedDur}ms;--delay:-${Math.min(timerElapsed(), timedDur)}ms"` : ""}></i>`).join("");
  const status = cur.done ? cur.status : null;
  let input = "", primary = "", waiting = false;
  const a = P.a[id];
  if (f.kind === "pick") {
    const ord = /\b(all|none|both) of|\babove\b|\bboth [a-d]\b/i.test(f.options.join(" ")) ? f.options.map((_, i) => i) : shuffledOrder(id + ":" + (P.n[id] || 0), f.options.length);
    input = `<div class="opts" role="group" aria-label="Options">` + ord.map(oi => {
      let cls = "opt", ic = "";
      // Once answered, the right answer (and your pick, if it was off) stay bright. The others stay in place, faded and
      // a little smaller, so a mis-tap is easy to spot and the explanation still fits without a long scroll.
      if (cur.done) { if (oi === f.correct) { cls += " ok"; ic = "✓"; } else if (a === oi) { cls += " wrong"; ic = "✕"; } else cls += " dim"; }
      if (fx && fx.oi === oi) cls += fx.kind === "right" ? " pop" : " sink";
      else if (fx && fx.oi !== undefined && fx.kind !== "right" && oi === f.correct) cls += " lift";   // a wrong pick: the right answer rises gently
      return `<button type="button" class="${cls}" data-pick="${oi}"${cur.done ? ' aria-disabled="true" tabindex="-1"' : ""}>${ic ? `<span class="k">${ic}</span>` : ""}<span>${fmt(f.options[oi])}</span></button>`;
    }).join("") + `</div>`;
  } else if (f.kind === "multi") {
    const sel = a || [];
    input = `<p class="lead">Pick all that apply.</p><div class="opts" role="group" aria-label="Options">` + q.options.map((o, i) => {
      let cls = "opt" + (sel.includes(i) ? " sel" : ""), ic = sel.includes(i) ? "✓" : "";
      // Once checked it reads like a single-answer question: a right pick is solid green with a tick, a wrong pick is red with
      // a cross, and a right option you did not pick is a quieter green with a tick. Everything else fades back, with no mark.
      let mark = `<span class="k box">${ic}</span>`;
      if (cur.done) { const right = q.correct.includes(i), ch = sel.includes(i); cls = "opt" + (ch && right ? " ok" : ch ? " wrong dim" : right ? " missed" : " dim"); mark = right ? `<span class="k">✓</span>` : ch ? `<span class="k">✕</span>` : ""; }
      return `<button type="button" class="${cls}" data-toggle="${i}" aria-pressed="${sel.includes(i)}"${cur.done ? ' aria-disabled="true" tabindex="-1"' : ""}>${mark}<span>${fmt(o)}</span></button>`;
    }).join("") + `</div>`;
    primary = "check";
  } else if (f.kind === "order") {
    // The list is always in the order it will be checked in. The first `k` rows have been given their place (they carry a
    // number); the rest are still waiting below them, in the order they were dealt.
    const n = q.items.length, ord = Array.isArray(a) && a.length === n ? a : orderStart(id, n), k = cur.done ? n : placedOf(P, id, n);
    waiting = !cur.done && k < n;
    input = `<p class="lead">${cur.done ? "Your order:" : TAP_ORDER ? "Tap in order. Hold to move." : "Drag into order."}</p><ol class="order${cur.done ? " done" : TAP_ORDER ? " taps" : ""}"${cur.done ? "" : ` data-k="${k}"`}>` + ord.map((it, pos) => {
      const ok = cur.done && it === pos;
      return `<li data-it="${it}" class="${cur.done ? (ok ? "ok" : "wrong") : pos < k ? "set" : ""}"${cur.done ? "" : ` role="button" tabindex="0"`}><span class="p">${cur.done ? (ok ? "✓" : "✕") : pos < k ? pos + 1 : ""}</span><span class="t">${fmt(q.items[it])}</span>${cur.done || !TAP_ORDER ? "" : HX}</li>`;
    }).join("") + `</ol>`;
    primary = "check";
  }
  const hint = q.hint && P.h[id] ? `<div class="hint"><b>Hint</b>${fmt(q.hint)}</div>` : "";
  // feedback: the explanation only (no verdict banner)
  let fb = "";
  if (cur.done) {
    const why = f.kind === "pick" ? f.why : q.answer, more = f.kind === "pick" ? f.more : "";
    const detail = f.kind === "order" && status !== "right" ? `<div class="yours">Right order: ${q.items.map((t, i) => `${i + 1}. ${fmt(t)}`).join(" · ")}</div>` : "";
    fb = `<section class="fb ${status}${keepScroll === "fb" && !reduceMotion() ? " wait" : ""}" aria-live="polite">${detail}<div class="model">${fmt(why)}</div>${more ? `<details class="more"><summary>Full answer</summary><p>${fmt(more)}</p></details>` : ""}</section>`;
  }
  const back = r.i > 0 ? `<button class="btn ghost back" data-act="back" aria-label="Previous question" type="button">‹</button>` : "";
  const hintBtn = q.hint && !P.h[id] && !cur.done && !r.review ? `<button class="btn ghost${primary ? "" : " grow"}" data-act="hint" type="button">💡 Hint</button>` : "";
  const bar = cur.done
    ? `${back}<button class="btn primary grow" data-act="next" type="button">${r.i + 1 >= r.ids.length ? (r.review ? "Done" : "Finish") : "Next"}</button>`
    : `${back}${hintBtn}${primary === "check" ? `<button class="btn primary grow${waiting ? " soft" : ""}" data-act="check" type="button">Check</button>` : ""}`;
  const long = f.prompt.length > 150 ? " long" : "";
  const isNum = q.type === "number";
  // Streak: the bar takes on the streak's colour. On a fresh right answer from 3 in a row, the bar first shows the old level, then the counter flies in and lifts it.
  const stk = r.review ? 0 : r.streak || 0, feeding = fx && fx.kind === "right" && stk >= 3, heatNow = heatLevel(feeding ? stk - 1 : stk);
  const html = `<header class="top play"><div class="top-in"><button class="icon-btn" data-go="quiz-${esc(quiz.id)}" data-replace="1" aria-label="Leave this round" type="button">✕</button><div class="dots${PAUSED ? " halted" : ""}" data-heat="${heatNow}" role="img" aria-label="Question ${r.i + 1} of ${r.ids.length}${stk >= 3 ? ", " + stk + " in a row" : ""}">${dots}</div>${r.review ? "" : `<span class="heat${heatNow ? " on" : ""}" data-heat="${heatNow}" aria-hidden="true"><span class="fl">${heatIcon(heatNow)}</span><b class="n">${feeding ? stk - 1 : stk}</b></span>`}${r.review ? "" : `<button class="icon-btn pause${PAUSED ? " on" : ""}${cur.done ? " gone" : ""}" data-act="pause" type="button" aria-pressed="${!!PAUSED}" aria-label="${PAUSED ? "Resume timer" : "Pause timer"}"${cur.done ? ' disabled aria-hidden="true" tabindex="-1"' : ""}>${PAUSED ? `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5l11 7-11 7z"/></svg>` : `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>`}</button>`}</div></header>
  <main class="wrap play">
    <div class="stage">
      <article class="qcardp${DIR > 0 ? " in-next" : DIR < 0 ? " in-prev" : ""}">
        ${isNum ? `<span class="numtag">Numbers</span>` : ""}
        <h2 class="prompt${long}" id="qprompt" tabindex="-1">${fmt(f.prompt)}</h2>
        ${f.setup ? `<p class="lead setup">No calculating. Pick the setup that gives the answer.</p>` : ""}
        ${input}${cur.done ? "" : hint}${fb}
      </article>
    </div>
  </main>
  ${bar.trim() ? `<div class="actionbar"><div class="actionbar-in">${bar}</div></div>` : ""}`;
  // Paint. While on the player, patch the screen in place instead of rebuilding it: the top bar (flame, sky, count)
  // keeps animating without restarting, and on an answer the options change in place so they can fade and fold smoothly.
  // A new question still gets a fresh card (for the slide-in).
  const onPlay = app().querySelector(".top.play") && app().querySelector(".qcardp");
  const heat0 = app().querySelector(".heat"), heatWas = !!(heat0 && heat0.classList.contains("on")), barW0 = heatWas !== !!heatNow && onPlay ? barWidth() : 0;
  const sameQ = !!(onPlay && keepScroll && app().dataset.qid === id);
  if (onPlay) { const t = document.createElement("div"); t.innerHTML = hxAll(html); patchKids(app(), t, sameQ); }
  else app().innerHTML = hxAll(html);
  app().dataset.qid = id;
  DIR = 0;
  // While a row is held, the page must not scroll under the finger. Only touches that start on the list are looked at.
  const ol = app().querySelector(".order:not(.done)"); if (ol && !ol._hold) { ol._hold = true; ol.addEventListener("touchmove", e => { if (dragging && e.cancelable) e.preventDefault(); }, { passive: false }); }
  if (!r.review) { placeSky(heatNow); placeGlint(heatNow); }
  if (barW0) slideFrom(barW0);
  armTimer(); if (TIMER && TIMER.pausedAt) { const dd = document.querySelector(".dots"); if (dd) dd.classList.add("paused"); }
  if (!keepScroll) { cancelScroll(); window.scrollTo(0, 0); }
  else {
    if (!sameQ) window.scrollTo(0, y0);
    const el = app().querySelector(".fb");
    if (keepScroll === "fb" && el) {
      const wrong = status && status !== "right", picked = fx && fx.oi !== undefined;
      // let the pop (or the soft settle of a wrong pick) play while the other options fade and shrink, then fade the explanation in and glide down to it
      settle(el, !picked ? 300 : wrong && !reduceMotion() ? 460 : 340);
    }
  }
  if (fx && fx.kind === "right") { buzz([12, 45, 18]); const ok = app().querySelector(".opt.ok"); if (ok) { if (fx.oi !== undefined) bloom(ok); burst(ok); } }
  if (feeding) streakFeed(stk, 420);
}
/* Patch the live screen to match freshly built HTML, keeping nodes that did not change (so their animations
   and transitions carry on). Nodes marked data-keep (the sky) are left alone. The timer bar is always swapped
   whole, so its fill restarts from the right spot. */
function patchKids(a, b, sameQ) {
  const ac = [...a.childNodes].filter(n => !(n.nodeType === 1 && n.hasAttribute("data-keep"))), bc = [...b.childNodes];
  bc.forEach((n, i) => {
    const o = ac[i];
    if (!o) a.appendChild(n);
    else if (!sameQ && n.nodeName === "MAIN") o.replaceWith(n);
    else morph(o, n);
  });
  for (let i = bc.length; i < ac.length; i++) ac[i].remove();
}
function morph(a, b) {
  if (a.nodeType !== b.nodeType || a.nodeName !== b.nodeName || (b.nodeType === 1 && b.classList.contains("dots"))) return a.replaceWith(b);
  if (a.nodeType !== 1) { if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue; return; }
  if (a.isEqualNode(b)) return;
  for (const { name } of [...a.attributes]) if (!b.hasAttribute(name)) a.removeAttribute(name);
  for (const { name, value } of [...b.attributes]) if (a.getAttribute(name) !== value) a.setAttribute(name, value);
  patchKids(a, b, true);
}
/* Scrolling for the answer: one native smooth scroll. On iPhone it runs on the compositor (off the main thread),
   so it stays smooth even while the flame and timer animate, and a touch stops it straight away.
   (Our old rAF loop called scrollTo every frame on the main thread and stuttered whenever anything else ran.) */
let SETTLE = 0;
function cancelScroll() { if (SETTLE) { clearTimeout(SETTLE); SETTLE = 0; } }
function smoothScrollTo(y) {
  if (Math.abs(y - window.scrollY) < 2) return;
  window.scrollTo({ top: y, behavior: reduceMotion() ? "auto" : "smooth" });
}
/* Where to scroll so as much of el as fits sits above the action bar (whole, if it can), without pushing
   `keep` (the answer you picked, or the question) up under the top bar. Never past the end of the page. */
function revealTarget(el, keep) {
  const y = window.scrollY, max = Math.max(0, document.documentElement.scrollHeight - innerHeight);
  let by = 0;
  if (el && el.isConnected) {
    const hdr = $(".top.play"), bar = $(".actionbar");
    const topY = (hdr ? hdr.getBoundingClientRect().bottom : 0) + 8, botY = (bar ? bar.getBoundingClientRect().top : innerHeight) - 12;
    const want = el.getBoundingClientRect().bottom - botY;
    if (want > 0) {
      const k = keep && keep.isConnected ? keep.getBoundingClientRect().top - topY : want;
      by = Math.min(want, Math.max(0, k)); if (by < 4) by = 0;
    }
  }
  return Math.min(max, Math.max(0, y + by));
}
function reveal(el, keep) { smoothScrollTo(revealTarget(el, keep)); }
/* While the page is moving (your finger, or the glide to the answer), the decorative loops in the top bar and the
   Next button's ring hold still, so the phone spends every frame on the scroll. They carry on when it stops.
   The timer is never paused. */
let SCROLLING = 0;
// The class goes on the two bars only (not the whole page), so starting and stopping a scroll restyles just them.
addEventListener("scroll", () => {
  if (!SCROLLING) document.querySelectorAll(".top.play, .actionbar").forEach(el => el.classList.add("scrolling")); else clearTimeout(SCROLLING);
  SCROLLING = setTimeout(() => { SCROLLING = 0; document.querySelectorAll(".scrolling").forEach(el => el.classList.remove("scrolling")); }, 160);
}, { passive: true });
/* After an answer: the other options have already faded and shrunk (a short CSS transition while the pick pops),
   so the layout is final by now. The explanation fades up (opacity + transform only) and the page glides once. */
function settle(fb, delay) {
  cancelScroll();
  SETTLE = setTimeout(() => {
    SETTLE = 0;
    if (!fb.isConnected) return;
    const keepEl = app().querySelector(".opt.ok, .opt.wrong, .order") || fb;
    fb.classList.remove("wait");
    if (!reduceMotion() && fb.animate) fb.animate([{ opacity: 0, transform: "translateY(12px)" }, { opacity: 1, transform: "none" }], { duration: 420, easing: "cubic-bezier(.25,.6,.3,1)", fill: "backwards" });
    reveal(fb, keepEl);
  }, delay);
}
// Confetti on a right answer: 16 pieces built once and kept (hidden) in the page; each burst only moves them.
let CONF = null, CONF_RUN = [];
/* ---- Kiron 1.4.2: a right pick lights up from under your finger. One reused layer that sits over the option (it is not
   inside it, so the option is never redrawn): a frame the shape of the option, and inside it a soft white circle that
   grows from the tap and fades. Transform and opacity only. The frame pops with the option so their edges stay together. ---- */
let TAPXY = null, BLOOM = null;
document.addEventListener("click", e => { TAPXY = e.clientX || e.clientY ? { x: e.clientX, y: e.clientY, t: Date.now() } : null; }, true);
function bloom(el) {
  if (reduceMotion() || !el.animate) return;
  const r = el.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight, left = r.left + (r.width - w) / 2, top = r.top + (r.height - h) / 2;
  const t = TAPXY && Date.now() - TAPXY.t < 600 ? TAPXY : null, lim = (v, m) => Math.max(0, Math.min(m, v));
  const x = t ? lim(t.x - left, w) : w / 2, y = t ? lim(t.y - top, h) : h / 2, rad = Math.ceil(Math.hypot(Math.max(x, w - x), Math.max(y, h - y)));
  if (!BLOOM || !BLOOM.isConnected) { BLOOM = document.createElement("i"); BLOOM.className = "bloom"; BLOOM.setAttribute("aria-hidden", "true"); BLOOM.append(document.createElement("b")); document.body.append(BLOOM); }
  const c = BLOOM.firstChild;
  BLOOM.style.cssText = `left:${left + scrollX}px;top:${top + scrollY}px;width:${w}px;height:${h}px`;
  c.style.cssText = `left:${x - rad}px;top:${y - rad}px;width:${rad * 2}px;height:${rad * 2}px`;
  [BLOOM, c].forEach(n => n.getAnimations().forEach(a => a.cancel()));
  const pe = "cubic-bezier(.3,1.6,.5,1)"; BLOOM.animate([{ transform: "scale(.96)", easing: pe }, { transform: "scale(1.04)", easing: pe }, { transform: "scale(1)" }], { duration: 450 });   // the option's own pop (pop2 in styles.css)
  c.animate([{ opacity: .4, transform: "scale(.08)" }, { opacity: 0, transform: "none" }], { duration: 480, easing: "cubic-bezier(.25,.6,.3,1)" });
}
function burst(el) {
  if (reduceMotion() || !document.body.animate) return;
  const cols = ["#d97757", "#faf9f5", "#6a9bcc", "#788c5d", "#e3b04b"];
  if (!CONF || !CONF[0].isConnected) {
    CONF = [];
    for (let i = 0; i < 16; i++) { const p = document.createElement("i"); p.className = "cfp"; p.setAttribute("aria-hidden", "true"); p.style.background = cols[i % cols.length]; document.body.append(p); CONF.push(p); }
  }
  CONF_RUN.forEach(a => a.cancel()); CONF_RUN = [];
  const b = el.getBoundingClientRect(), x = b.right - 28, y = b.top + b.height / 2;
  CONF.forEach((p, i) => {
    const ang = (Math.PI * 2 * i) / 16 + Math.random() * .4, d = 50 + Math.random() * 70, dx = Math.cos(ang) * d, dy = Math.sin(ang) * d - 20;
    CONF_RUN.push(p.animate([{ opacity: 1, transform: `translate3d(${x}px,${y}px,0) rotate(0deg)` }, { opacity: 0, transform: `translate3d(${x + dx}px,${y + dy}px,0) rotate(360deg)` }], { duration: 750, easing: "ease-out" }));
  });
}
/* Streak: from 3 in a row, each right answer is rewarded: "N in a row" pops up at the top centre, then swoops
   into the flame and count at the end of the bar, which pop and flash as it lands (see streakFeed).
   The bar, the flame and the count beside it take the streak's colour. The timer keeps running throughout.
   Fire:      3 amber · 5 gold · 8 pale gold · 11 white-hot · 15 black fire
   Celestial: 20 nebula (violet, magenta and teal clouds drift behind the bar)
              25 constellation (stars appear around the bar and join up with fine lines)
              30 galaxy (clouds, constellation and a ringed star; the bar shimmers gold-white)
   A wrong answer, or leaving the quiz, cools it back. */
const BLACK_FIRE = 15, STAGES = [3, 5, 8, 11, BLACK_FIRE, 20, 25, 30];
const heatLevel = n => { let l = 0; STAGES.forEach((t, i) => { if (n >= t) l = i + 1; }); return l; };
// The flame: two shapes, an outer tongue and a hot core, that flicker out of step. From 25 it becomes a star; at 30 a ringed star.
// Each moving part is its own small SVG stacked in an HTML box, and the flicker, twinkle and orbit move those boxes
// (transform only), so iPhone Safari runs them on the GPU instead of repainting the inside of an SVG every frame.
const STAR_D = "M0-11C1.1-3.2 3.2-1.1 11 0C3.2 1.1 1.1 3.2 0 11C-1.1 3.2-3.2 1.1-11 0C-3.2-1.1-1.1-3.2 0-11Z";
function heatIcon(l) {
  if (l >= 6) gradDefs();
  if (l >= 8) { const sv = (c, inner) => `<svg${c ? ` class="${c}"` : ""} viewBox="-14 -14 28 28" aria-hidden="true">${inner}</svg>`;
    return `<span class="kstar ringed" aria-hidden="true">${sv("kr", `<ellipse class="ring" rx="12.5" ry="4.2" transform="rotate(-22)"/>`)}${sv("ks", `<path class="s" d="${STAR_D}"/>`)}${sv("kc", `<circle class="core" r="1.8"/>`)}<span class="kmo"><span class="moon">${sv("", `<circle cx="12.5" r="4.4"/>`)}</span></span></span>`; }
  if (l >= 7) return `<svg class="kstar" viewBox="-14 -14 28 28" aria-hidden="true"><path class="s" d="${STAR_D}"/><circle class="core" r="1.8"/></svg>`;
  return `<span class="kf" aria-hidden="true"><svg class="o" viewBox="0 0 24 32"><path d="M12 1.5c1.2 6.2 7.5 9.6 7.5 18a7.5 7.5 0 0 1-15 0c0-4.1 2-6.9 3.7-8.4.3 2.5 1.4 3.8 2.8 4.3C10.4 10.6 10.8 5.7 12 1.5z"/></svg><svg class="c" viewBox="0 0 24 32"><path d="M12.2 14.5c.7 3 4.1 4.7 4.1 8.4a4.3 4.3 0 0 1-8.6 0c0-2.1 1-3.4 2.1-4.2.2 1.1.8 1.7 1.4 1.9-.2-2.4.2-4.3 1-6.1z"/></svg></span>`;
}
// Two colour gradients the flame and the ringed star are filled with (nebula at 20, gold at 30).
function gradDefs() {
  if ($("#kgrad-svg")) return;
  const NS = "http://www.w3.org/2000/svg", svg = document.createElementNS(NS, "svg");
  svg.id = "kgrad-svg"; svg.setAttribute("width", "0"); svg.setAttribute("height", "0"); svg.setAttribute("aria-hidden", "true"); svg.style.position = "absolute";
  svg.innerHTML = `<defs>
    <linearGradient id="kneb" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#4fb6c9"/><stop offset=".5" stop-color="#c86bd1"/><stop offset="1" stop-color="#7c5cff"/></linearGradient>
    <linearGradient id="kgold" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#c9b8ff"/><stop offset=".5" stop-color="#ffffff"/><stop offset="1" stop-color="#ffe3a0"/></linearGradient></defs>`;
  document.body.append(svg);
}
/* The counter at the end of the bar opens or closes in one layout step (no width or margin animation, which
   re-laid out the whole top bar for a third of a second). The bar then eases to its new length with a transform. */
const barWidth = () => { const d = $(".dots"); return d ? d.getBoundingClientRect().width : 0; };
function slideFrom(w0) {
  const d = $(".dots"), w1 = barWidth(); if (!d || !w0 || !w1 || Math.abs(w0 - w1) < 1 || reduceMotion() || !d.animate) return;
  d.animate([{ transform: `scaleX(${(w0 / w1).toFixed(4)})`, transformOrigin: "0 50%" }, { transform: "none", transformOrigin: "0 50%" }], { duration: 300, easing: "cubic-bezier(.2,.8,.3,1)" });
}
function slideBar(change) { const w0 = barWidth(); change(); slideFrom(w0); }
// a tiny seeded random, so the sky looks the same on every screen of a run instead of jumping around
const seeded = seed => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
// The celestial sky lives behind the timer bar, inside the top bar only (never over the question).
function placeSky(lvl, fresh) {
  const top = $(".top.play .top-in"), dots = $(".dots"); if (!top || !dots) return;
  let sky = top.querySelector(".sky");
  if (lvl < 6) { if (sky) sky.remove(); return; }
  gradDefs();
  const t = top.getBoundingClientRect(), d = dots.getBoundingClientRect(), W = Math.round(d.width + 40), H = 56;
  if (!sky) { sky = document.createElement("span"); sky.className = "sky"; sky.setAttribute("aria-hidden", "true"); sky.dataset.keep = "1"; top.prepend(sky); }
  const css = `left:${d.left - t.left - 20}px;top:${d.top - t.top + d.height / 2 - H / 2}px;width:${W}px;height:${H}px`;
  if (sky._css !== css) { sky._css = css; sky.style.cssText = css; }   // skip the write when nothing moved
  // Same stage, same size: leave the stars where they are (rebuilding would make them jump back every question).
  if (!fresh && sky.dataset.key === lvl + ":" + W) return;
  sky.dataset.key = lvl + ":" + W; sky.dataset.heat = lvl; sky.classList.toggle("fresh", !!fresh);
  const rnd = seeded(7 + lvl), still = reduceMotion();
  let h = "";
  if (lvl !== 7) h += `<b class="neb n1"></b><b class="neb n2"></b><b class="neb n3"></b>`;
  if (lvl >= 7) {
    const n = Math.max(5, Math.min(9, Math.round(W / 34))), pts = [];
    for (let i = 0; i < n; i++) { const up = i % 2 ? -1 : 1; pts.push([Math.round(W * .12 + W * .76 * (i + .15 + rnd() * .7) / n), Math.round(H / 2 + up * (5 + rnd() * 7))]); }
    // The lines are thin plain strips, each turned to point at the next star. On a new stage each one grows out
    // from its star (a stretch, which the GPU does) instead of being drawn along (which repainted every frame).
    h += pts.slice(1).map((p, i) => { const q = pts[i], len = Math.hypot(p[0] - q[0], p[1] - q[1]), a = Math.atan2(p[1] - q[1], p[0] - q[0]) * 180 / Math.PI;
      return `<b class="ln" style="left:${q[0]}px;top:${q[1]}px;width:${len.toFixed(1)}px;--a:${a.toFixed(1)}deg;--i:${i}"></b>`; }).join("");
    // The stars are plain round dots with their glow drawn once (a shadow), so they twinkle on the GPU.
    h += pts.map((p, i) => { const r = i % 3 ? 1.3 : 1.9; return `<b class="cs" style="left:${(p[0] - r).toFixed(1)}px;top:${(p[1] - r).toFixed(1)}px;width:${2 * r}px;height:${2 * r}px;--i:${i}"></b>`; }).join("");
  }
  const np = lvl >= 8 ? 16 : 10;
  for (let i = 0; i < np; i++) h += `<i style="left:${(rnd() * 100).toFixed(1)}%;top:${(10 + rnd() * 80).toFixed(1)}%;--s:${(1 + rnd() * 1.6).toFixed(1)}px;--d:${(4 + rnd() * 5).toFixed(1)}s;--l:-${(rnd() * 8).toFixed(1)}s;--x:${Math.round(rnd() * 24 - 12)}px"></i>`;
  sky.innerHTML = h;
  if (still) sky.classList.add("still");
}
/* The bar's shimmer at 15 (black fire: an ember glow) and 30 (galaxy: gold-white): a soft band of light that
   glides along the bar now and then. It moves (transform) instead of sliding the bar's gradient (which repainted
   the bar every frame). The old shimmer had in fact never shown: a stronger rule switched it off. */
function placeGlint(lvl) {
  const top = $(".top.play .top-in"), dots = $(".dots"); if (!top || !dots) return;
  let g = top.querySelector(".glint");
  if (lvl !== 5 && lvl !== 8) { if (g) g.remove(); return; }
  if (!g) { g = document.createElement("span"); g.className = "glint"; g.setAttribute("aria-hidden", "true"); g.dataset.keep = "1"; g.innerHTML = "<b></b>"; top.append(g); }
  const t = top.getBoundingClientRect(), d = dots.getBoundingClientRect();
  const css = `left:${d.left - t.left}px;top:${d.top - t.top}px;width:${d.width}px;height:${d.height}px;--w:${d.width}px`;
  if (g.dataset.heat !== String(lvl)) g.dataset.heat = lvl;
  if (g._css !== css) { g._css = css; g.style.cssText = css; }
}
addEventListener("resize", () => { const s = $(".sky"), d = $(".dots"); if (s && d) placeSky(+d.dataset.heat || 0); if (d) placeGlint(+d.dataset.heat || 0); });
/* ---------- The streak reward: appear, beat, fly to the counter, land ----------
   Everything here runs as Web Animations on transform and opacity only, so iPhone Safari hands it to the GPU
   (the compositor) and it plays at the screen's full 120Hz even if the page is busy. No filters, shadows, blurs,
   masks or size changes move. The pieces are built once and stay in the page, hidden; a run only sets where they
   start, then animates them, so starting it costs no layout.
   Why the old bubble paused half way: its flight was cut into several keyframes, each with its own ease-in-out
   curve, so the speed fell to zero at every keyframe and it visibly stopped for a moment. Each motion here is ONE
   animation with ONE curve. The curved path comes from two nested wrappers (one moves sideways, the other up)
   on different curves, never from stops along the way. */
const SPRING_OK = typeof CSS !== "undefined" && CSS.supports && CSS.supports("animation-timing-function", "linear(0, 1)");
// A spring written out as a linear() curve (Safari 17.2+), so the GPU can play the bounce on its own.
// settle: goes 0 -> 1 with one soft overshoot. kick: goes 0 -> 1 -> back to 0 with a small dip (for pops).
function springCurve(kind, zeta) {
  const z = zeta, w = 6.4 / z, wd = w * Math.sqrt(1 - z * z), pts = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40, e = Math.exp(-z * w * t);
    const v = kind === "kick" ? e * Math.sin(wd * t) / Math.exp(-z * w * Math.atan(wd / (z * w)) / wd) / Math.sin(Math.atan(wd / (z * w)))
                              : 1 - e * (Math.cos(wd * t) + (z * w / wd) * Math.sin(wd * t));
    pts.push((i === 40 ? (kind === "kick" ? 0 : 1) : v).toFixed(4));
  }
  return `linear(${pts.join(", ")})`;
}
const EASE = {
  appear: SPRING_OK ? springCurve("settle", .52) : "cubic-bezier(.34,1.45,.64,1)",
  kick: SPRING_OK ? springCurve("kick", .42) : null,
  drop: SPRING_OK ? springCurve("settle", .74) : "cubic-bezier(.3,1.2,.5,1)",   // a dropped row: quick, one small overshoot
  flyX: "cubic-bezier(.7,0,.9,.5)",   // sideways: starts slow, keeps speeding up into the counter
  flyY: "cubic-bezier(.3,.05,.5,1)",     // upward: lifts early, so the path bends in an arc
  flyS: "cubic-bezier(.55,0,.85,.45)",   // shrinking: speeds up with the flight
  out: "cubic-bezier(.16,.8,.3,1)"
};
// A quick swell that springs back (the count, the flame, the bar on landing). Without linear(), a plain swell.
// add = play on top of the element's own CSS motion (the black-fire sway) instead of replacing it for a moment,
// so the sway carries on through the kick and nothing snaps when it ends.
function kick(el, prop, amount, dur, add) {
  if (!el || !el.animate) return null;
  const base = prop === "scaleY" ? "scaleY(" : "scale(", o = add ? { composite: "add" } : {};
  return EASE.kick
    ? el.animate([{ transform: base + "1)" }, { transform: base + (1 + amount) + ")" }], Object.assign({ duration: dur, easing: EASE.kick }, o))
    : el.animate([{ transform: base + "1)" }, { transform: base + (1 + amount) + ")", offset: .3 }, { transform: base + "1)" }], Object.assign({ duration: dur, easing: "ease-out" }, o));
}
let FX_EL = null;
function fxLayer() {
  if (FX_EL && FX_EL.isConnected) return FX_EL;
  const root = document.createElement("div"); root.className = "fx"; root.setAttribute("aria-hidden", "true");
  let h = `<div class="fx-x fx-main"><div class="fx-y"><div class="fx-k"><div class="fx-s"><b class="fx-halo"></b><span class="fxpill"></span></div></div></div></div>`;
  for (let i = 0; i < 3; i++) h += `<div class="fx-x fx-tr"><div class="fx-y"><b class="fx-dot"></b></div></div>`;
  h += `<div class="fx-sweep"><b class="fx-band"></b></div><div class="fx-burst"><b class="fx-flash"></b><b class="fx-ring"></b><b class="fx-ring fx-ring2"></b>${"<i></i>".repeat(16)}</div>`;
  root.innerHTML = h; document.body.append(root); FX_EL = root; return root;
}
let FEED = [], FXRUN = [], FXID = 0;
function clearFeed() {
  FEED.forEach(clearTimeout); FEED = [];
  FXRUN.forEach(a => { try { a.cancel(); } catch (e) {} }); FXRUN = [];
  if (FX_EL) FX_EL.classList.remove("run");
}
const fxAnim = (el, kf, opt) => { const a = el.animate(kf, Object.assign({ fill: "both" }, opt)); FXRUN.push(a); return a; };
// The streak only starts once the answer's pop, the confetti and the options folding away are done,
// so the phone is never doing two heavy things in the same frames.
function streakFeed(n, wait) {
  clearFeed(); const id = ++FXID;
  if (wait && !reduceMotion()) { FEED.push(setTimeout(() => { FEED = []; streakFeed(n); }, wait)); return; }
  const dots = $(".dots"), slot = $(".heat"); if (!dots || !slot) return;
  const lvl = heatLevel(n), up = lvl !== heatLevel(n - 1), still = reduceMotion() || !document.body.animate;
  const fx = fxLayer(), main = fx.querySelector(".fx-main"), pill = fx.querySelector(".fxpill");
  fx.dataset.heat = lvl; fx.classList.toggle("up", up);
  pill.innerHTML = `<span class="fl">${heatIcon(lvl)}</span>${n} in a row`;
  // The first time a streak shows, the counter slides open at the end of the bar now (while the eye is on the
  // pill), empty, so the pill has somewhere to land. It fills in when the pill arrives.
  if (!slot.classList.contains("on")) slideBar(() => slot.classList.add("on", "pre"));
  const hdr = ($(".top.play") || dots).getBoundingClientRect(), px = innerWidth / 2, py = hdr.bottom + 44;
  [main, ...fx.querySelectorAll(".fx-tr")].forEach(el => { el.style.transform = `translate3d(${px}px,${py}px,0)`; });
  fx.classList.add("run");
  if (still) {
    // Reduced motion: the pill fades in where it is, stays a moment, fades out. The bar updates plainly.
    if (main.animate) fxAnim(main.querySelector(".fx-s"), [{ opacity: 0, transform: "scale(.94)" }, { opacity: 1, transform: "scale(.94)", offset: .15 }, { opacity: 1, transform: "scale(.94)", offset: .8 }, { opacity: 0, transform: "scale(.94)" }], { duration: 1500, easing: "linear" });
    FEED.push(setTimeout(() => { landState(n, lvl, up); placeSky(lvl, up); placeGlint(lvl); }, 400), setTimeout(clearFeed, 1550));
    return;
  }
  // 1 APPEAR: fades in and springs up to size in place. The text is drawn at full size and only ever shown
  // at or below it, so it stays crisp.
  const s = main.querySelector(".fx-s");
  fxAnim(s, [{ opacity: 0, transform: "scale(.8)" }, { opacity: 1, transform: "scale(.94)", offset: .22 }, { opacity: 1, transform: "scale(.94)" }], { duration: 560, easing: EASE.appear });
  // 2 BEAT: a slow swell while you read it, so it never sits frozen.
  fxAnim(pill, [{ transform: "scale(1)" }, { transform: "scale(1.035)" }], { duration: 1300, easing: "cubic-bezier(.3,0,.5,1)" });
  const BEAT = 720, FLY = 290;
  FEED.push(setTimeout(() => fly(n, lvl, up, FLY, id), BEAT));
}
// 3 FLY: one accelerating swoop along an arc into the flame and count, shrinking as it goes, with a short comet tail.
function fly(n, lvl, up, dur, id) {
  const fx = FX_EL, slot = $(".heat"), dots = $(".dots"); if (!fx || !slot || !dots) return clearFeed();
  const main = fx.querySelector(".fx-main"), sl = slot.getBoundingClientRect(), d = dots.getBoundingClientRect();
  const px = innerWidth / 2, py = ($(".top.play") || dots).getBoundingClientRect().bottom + 44;
  const tx = sl.width > 4 ? sl.left + sl.width / 2 : d.right - 6, ty = d.top + d.height / 2, dx = tx - px, dy = ty - py;
  const x = el => fxAnim(el, [{ transform: `translate3d(${px}px,${py}px,0)` }, { transform: `translate3d(${tx}px,${py}px,0)` }], { duration: dur, easing: EASE.flyX, delay: el._lag || 0 });
  const y = (el, lag) => fxAnim(el, [{ transform: "translate3d(0,0,0)" }, { transform: `translate3d(0,${dy}px,0)` }], { duration: dur, easing: EASE.flyY, delay: lag || 0 });
  const ax = x(main); y(main.firstElementChild);
  fxAnim(main.querySelector(".fx-k"), [{ opacity: 1, transform: "scale(1)" }, { opacity: 1, transform: "scale(.16)", offset: .82 }, { opacity: 0, transform: "scale(.1)" }], { duration: dur, easing: EASE.flyS });
  fx.querySelectorAll(".fx-tr").forEach((tr, i) => {
    const lag = 26 + i * 26; tr._lag = lag; x(tr); y(tr.firstElementChild, lag);
    fxAnim(tr.querySelector(".fx-dot"), [{ opacity: 0, transform: "scale(1.5)" }, { opacity: .75 - i * .2, transform: "scale(1.1)", offset: .45 }, { opacity: 0, transform: "scale(.35)" }], { duration: dur, easing: "linear", delay: lag });
  });
  ax.finished.then(() => land(n, lvl, up, tx, ty, id)).catch(() => {});
}
// The bar's real state: colour, count and flame/star for the new level.
function landState(n, lvl, up) {
  const dots = $(".dots"), slot = $(".heat"); if (!dots || !slot) return {};
  dots.dataset.heat = lvl; slot.dataset.heat = lvl; slot.classList.add("on"); slot.classList.remove("pre");
  const num = slot.querySelector(".n"); if (num && num.textContent !== String(n)) num.textContent = n;
  const fl = slot.querySelector(".fl"); if (fl && up) fl.innerHTML = heatIcon(lvl);
  return { dots, slot, num, fl };
}
// 4 LAND: the reward. The count ticks up with a pop, the flame pulses, a ring and sparks burst from it and one
// light sweeps back along the bar. All of it grows a little with each streak level.
function land(n, lvl, up, tx, ty, id) {
  const fx = FX_EL; if (!fx) return;
  buzz(28);
  const { dots, slot, fl } = landState(n, lvl, up); if (!dots) return clearFeed();
  const k = Math.min(lvl, 8) / 8, done = [], big = up ? .2 : 0;
  // The hit: everything it lands on jumps at once (count, flame, the whole bar), harder than before.
  kick(slot, "scale", .26 + .14 * k + big, 560); kick(fl, "scale", .6 + .35 * k + big, 640, true); kick(dots, "scaleY", 1.6 + 1.1 * k, 520);
  const burst = fx.querySelector(".fx-burst");
  burst.style.transform = `translate3d(${tx}px,${ty}px,0)`;
  // A flash at the point of impact, then two rings: a tight fast one and a wide slow one, like a clap and its echo.
  done.push(fxAnim(burst.querySelector(".fx-flash"), [{ opacity: .95, transform: "scale(.2)" }, { opacity: 0, transform: `scale(${1.15 + .6 * k + big})` }], { duration: 300, easing: EASE.out }));
  const rings = burst.querySelectorAll(".fx-ring");
  done.push(fxAnim(rings[0], [{ opacity: 1, transform: "scale(.14)" }, { opacity: 0, transform: `scale(${.8 + .5 * k + big})` }], { duration: 480, easing: EASE.out }));
  done.push(fxAnim(rings[1], [{ opacity: 0, transform: "scale(.2)" }, { opacity: .6, transform: "scale(.5)", offset: .12 }, { opacity: 0, transform: `scale(${1.5 + .9 * k + big * 2})` }], { duration: 760, easing: EASE.out, delay: 60 }));
  const sparks = burst.querySelectorAll("i"), ns = Math.min(16, 7 + lvl + (up ? 3 : 0));
  sparks.forEach((sp, i) => {
    if (i >= ns) return;
    const a = -Math.PI * (.04 + .92 * (i + .5) / ns) + (i % 2 ? .12 : -.12), r = 30 + 22 * k + (i % 3) * 9;
    done.push(fxAnim(sp, [{ opacity: 1, transform: "translate3d(0,0,0) scale(1.5)" }, { opacity: 0, transform: `translate3d(${(Math.cos(a) * r * 1.35).toFixed(1)}px,${(Math.sin(a) * r).toFixed(1)}px,0) scale(.3)` }], { duration: 520 + (i % 3) * 70, easing: EASE.out }));
  });
  const d = dots.getBoundingClientRect(), sw = fx.querySelector(".fx-sweep");
  sw.style.transform = `translate3d(${d.left}px,${d.top - 5}px,0)`; sw.style.width = d.width + "px"; sw.style.height = d.height + 10 + "px";
  done.push(fxAnim(sw.firstElementChild, [{ opacity: 0, transform: `translate3d(${d.width}px,0,0)` }, { opacity: .55 + .4 * k, transform: `translate3d(${d.width * .7}px,0,0)`, offset: .15 }, { opacity: 0, transform: "translate3d(-96px,0,0)" }], { duration: 620, easing: "cubic-bezier(.25,.55,.35,1)" }));
  // Only after the landing has played: rebuild the sky for a new stage, then put everything away.
  Promise.all(done.map(a => a.finished)).then(() => { if (id === FXID) clearFeed(); placeSky(lvl, up); placeGlint(lvl); }).catch(() => {});
}
function finalize(status) {
  const { quiz, P } = current, r = P.round, id = P.cur.id;
  const first = !P.cur.done;
  P.cur.done = true; P.cur.status = status;
  P.st[id] = status; r.res[id] = status;
  if (first) {
    r.streak = status === "right" ? (r.streak || 0) + 1 : 0; r.best = Math.max(r.best || 0, r.streak);
    FX = { id, kind: status === "right" ? "right" : "wrong" };
  }
  else if (status !== "right") r.streak = 0;
  saveProg();
}
// Story-style moves: forward (answered: next; unanswered: leave it for later) and back.
function nav(dir) {
  if (!current) return;
  const { quiz, P } = current, r = P.round; if (!r || r.ended || r.i >= r.ids.length) return;
  const id = r.ids[r.i];
  if (dir < 0) { if (r.i === 0) return; r.i--; P.cur = null; DIR = -1; saveProg(); return renderPlay(); }
  if (!r.review && (!P.cur || !P.cur.done)) { if (!P.st[id]) P.st[id] = "skip"; r.res[id] = "skip"; }
  if (r.review && r.i + 1 >= r.ids.length) { P.round = null; P.cur = null; saveProg(); return go("quiz-" + quiz.id, true); }
  r.i++; P.cur = null; DIR = 1; if (r.i >= r.ids.length) { r.ended = true; }
  saveProg(); renderPlay(); const h = $("#qprompt") || $("#endh"); if (h) h.focus({ preventScroll: true });
}
function playAct(act, el) {
  const { quiz, P } = current, r = P.round; if (!r) return;
  if (r.ended || r.i >= r.ids.length) return;
  const cur = P.cur, { q, id } = getQ(quiz, r.ids[r.i]), f = formOf(q);
  if (act === "pick") { if (cur.done) return; const oi = +el.dataset.pick; P.a[id] = oi; const ok = oi === f.correct; finalize(ok ? "right" : "miss"); FX = { id, kind: ok ? "right" : "wrong", oi }; return renderPlay("fb"); }
  if (act === "toggle") { if (cur.done) return; const i = +el.dataset.toggle, s = new Set(P.a[id] || []); s.has(i) ? s.delete(i) : s.add(i); P.a[id] = [...s].sort((x, y) => x - y); saveProg(); renderPlay(true); const b = app().querySelector(`[data-toggle="${i}"]`); if (b) b.focus(); return; }
  if (act === "hint") { P.h[id] = true; saveProg(); renderPlay(true); const h = app().querySelector(".hint"); if (h) h.classList.add("fresh"); if (h) reveal(h, $(".opts, .order") || $("#qprompt")); return; }
  if (act === "pause") { if (cur.done) return; PAUSED = !PAUSED; if (TIMER) { clearTimeout(TIMER.to); if (PAUSED) { if (!TIMER.pausedAt) TIMER.pausedAt = Date.now(); } else if (TIMER.pausedAt && !document.hidden) { TIMER.t0 += Date.now() - TIMER.pausedAt; TIMER.pausedAt = 0; } } return renderPlay(true); }
  if (act === "back") return nav(-1);
  if (act === "check") {
    if (cur.done) return;
    if (f.kind === "multi") finalize(gradeMulti(q, P.a[id]));
    else if (f.kind === "order") { endDrag(); if (placedOf(P, id, q.items.length) < q.items.length) return; if (!P.a[id]) P.a[id] = orderStart(id, q.items.length); finalize(gradeOrder(q, P.a[id])); }
    else return;
    return renderPlay("fb");
  }
  if (act === "next") { if (!cur.done) return; return nav(1); }
}

/* ---- Ordering by hand. The whole row is the control.
   Kiron 1.5.1 (now): drag. Touch a row anywhere and it lifts at once; carry it and let go, and it snaps into the slot
   under the finger. Every row always has its number. The page scrolls from anywhere that is not a row.
   Kiron 1.5 (saved, TAP_ORDER = true brings it back whole): tap in order. Tap what comes first and it takes number 1
   and flies to the top; tap the next and it lands under it; the last one left places itself. Tapping a numbered row
   hands its number back. A finger resting on a row lifts it (a hold), and a finger that moves straight away scrolls.
   The list has slots (first, second, ...). A row is always in exactly one slot, and the first `k` slots are the placed ones. */
const TAP_ORDER = false;
let dragging = null;   // the row being held, if any
let DRAG = null;       // { end } for the drag in progress
let HOLD = null;       // { stop } for a finger resting on a row, not lifted yet
function endDrag() { if (HOLD) HOLD.stop(); if (DRAG) DRAG.end(); }
const placedOf = (P, id, n) => !TAP_ORDER ? n : !Array.isArray(P.a[id]) || P.a[id].length !== n ? 0 : P.k && P.k[id] != null ? Math.min(n, P.k[id]) : n;
// Nothing may be left floating: clear any leftover hold state and offsets before the list is measured or changed.
function restRows(ol) {
  ol.classList.remove("sorting");
  for (const r of ol.children) { r.getAnimations().forEach(a => a.cancel()); r.style.transform = ""; r.classList.remove("drag", "fly"); }
}
// Numbers follow the slots: the first k rows read 1, 2, 3 from the top, the waiting rows carry none. Check wakes up once every row has a place.
function syncOrder(ol, k, save) {
  const kids = [...ol.children];
  ol.dataset.k = k;
  kids.forEach((li, i) => { const on = i < k, txt = on ? String(i + 1) : "", p = li.querySelector(".p"); if (li.classList.contains("set") !== on) li.classList.toggle("set", on); if (p.textContent !== txt) p.textContent = txt; });
  const chk = document.querySelector('.actionbar [data-act="check"]'); if (chk) chk.classList.toggle("soft", k < kids.length);
  if (save && current && current.P.cur && !current.P.cur.done) { const P = current.P, id = P.cur.id; P.a[id] = kids.map(li => +li.dataset.it); (P.k = P.k || {})[id] = k; saveProg(); }
}
// Move a row to a slot. Every row is put squarely in its new slot at once, and only glides there from where it looked
// (one transform each, so a quick run of taps never queues up). The tapped row rides above the rest and lands with a small settle.
function moveLi(ol, li, to) {
  const kids = [...ol.children], from = kids.indexOf(li);
  if (to < 0 || to >= kids.length || to === from) return false;
  const before = new Map(kids.map(r => [r, r.getBoundingClientRect().top]));
  ol.insertBefore(li, to > from ? kids[to].nextSibling : kids[to]);
  restRows(ol);
  if (!reduceMotion() && li.animate) kids.forEach(r => {
    const d = before.get(r) - r.getBoundingClientRect().top; if (!d) return;
    const kf = [{ transform: `translate3d(0,${d}px,0)` }, { transform: "translate3d(0,0,0)" }];
    if (r === li) { r.classList.add("fly"); const a = r.animate(kf, { duration: 400, easing: EASE.drop }); a.onfinish = a.oncancel = () => r.classList.remove("fly"); }
    else r.animate(kf, { duration: 300, easing: DRAG_EASE });
  });
  return true;
}
function tapRow(li) {
  endDrag();
  const ol = li.parentElement, kids = [...ol.children], n = kids.length, i = kids.indexOf(li); let k = Math.min(n, +ol.dataset.k || 0);
  if (i >= k) { moveLi(ol, li, k); k++; if (k === n - 1) k = n; }   // takes the next number; the last one left needs no tap
  else { k--; moveLi(ol, li, k); }                                    // hands its number back and waits just under the placed rows
  syncOrder(ol, k, true);
}
document.addEventListener("click", e => {
  const li = TAP_ORDER && e.target.closest && e.target.closest(".order:not(.done) li"); if (!li || !current) return;
  if (e.target.classList.contains("hx")) buzz(10);
  tapRow(li);
});
document.addEventListener("keydown", e => {
  const li = e.target.closest && e.target.closest(".order:not(.done) li"); if (!li || !current) return;
  if (TAP_ORDER) { if (e.key !== "Enter" && e.key !== " ") return; e.preventDefault(); tapRow(li); }
  else { const d = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0; if (!d) return; e.preventDefault(); endDrag(); const ol = li.parentElement; if (moveLi(ol, li, [...ol.children].indexOf(li) + d)) syncOrder(ol, ol.children.length, true); }
  li.focus({ preventScroll: true });
});
document.addEventListener("contextmenu", e => { if (e.target.closest && e.target.closest(".order li")) e.preventDefault(); });
// Drag (now): a finger on a row lifts it at once. Tap-to-order (saved): a finger resting on a row lifts it after a moment,
// and moving first means a scroll (or a tap that slipped).
const HOLD_MS = 180, HOLD_SLOP = 8;
document.addEventListener("pointerdown", e => {
  const li = e.target.closest && e.target.closest(".order:not(.done) li"); if (!li || !current || e.button > 0) return;
  endDrag();
  const pid = e.pointerId, mouse = e.pointerType === "mouse", x0 = e.clientX, y0 = e.clientY; let y = y0, timer = 0;
  const stop = () => { clearTimeout(timer); HOLD = null; window.removeEventListener("pointermove", mv, true); window.removeEventListener("pointerup", stop, true); window.removeEventListener("pointercancel", stop, true); };
  const lift = () => { stop(); if (li.isConnected && !li.parentElement.classList.contains("done")) startDrag(li, pid, mouse ? y0 : y, y, mouse); };
  const mv = ev => { if (ev.pointerId !== pid) return; y = ev.clientY; if (Math.hypot(ev.clientX - x0, y - y0) > (mouse ? 4 : HOLD_SLOP)) mouse ? lift() : stop(); };
  window.addEventListener("pointermove", mv, true); window.addEventListener("pointerup", stop, true); window.addEventListener("pointercancel", stop, true);
  HOLD = { stop };
  if (!mouse) { if (TAP_ORDER) timer = setTimeout(lift, HOLD_MS); else lift(); }   // with a mouse, moving is the lift
});
/* Dragging works the way reordering does in iPhone lists. Nothing in the list is re-arranged while the finger is
   down: the held row rides under the finger, and the rows it passes slide aside into the gap it left (each a single
   transform the phone animates by itself). Letting go springs the held row into the open slot; only then is the
   list re-arranged for real, in the exact spot everything is already showing, so nothing jumps.
   Rows are measured once, when the hold starts. */
const DRAG_EASE = "cubic-bezier(.2,.8,.2,1)";
function startDrag(li, pid, startY, nowY, mouse) {
  const ol = li.parentElement, g = li, k0 = Math.min(ol.children.length, +ol.dataset.k || 0); let carried = false;
  restRows(ol);
  const rows = [...ol.children], n = rows.length, f = rows.indexOf(li), still = reduceMotion() || !li.animate;
  const top = rows.map(r => r.offsetTop), h = rows.map(r => r.offsetHeight), mid = rows.map((r, i) => top[i] + h[i] / 2);
  const hl = h[f], step = hl + (n > 1 ? top[1] - top[0] - h[0] : 0), minY = top[0], maxY = top[n - 1] + h[n - 1] - hl;
  const nums = rows.map(r => r.querySelector(".p")), moved = rows.map(() => 0);
  let lastY = nowY, raf = 0, y = top[f], t = f, phase = 1, settle = null, lift = null;
  dragging = li; li.classList.add("drag"); ol.classList.add("sorting");
  try { g.setPointerCapture(pid); } catch (_) {}
  if (!still) lift = li.animate([{ scale: "1" }, { scale: "1.03" }], { duration: 180, easing: DRAG_EASE, fill: "forwards" });
  // Past either end of the list the row still follows, but with growing resistance, like the end of an iPhone list.
  const band = d => 46 * (1 - 1 / (d / 90 + 1));
  // Where the held row will sit if let go now: the top of slot `to`.
  const slotTop = to => to <= f ? top[to] : top[to] + h[to] - hl;
  const place = () => {
    raf = 0;
    // Carrying a row gives every row a place: from here the list reads 1, 2, 3 all the way down.
    if (!carried && Math.abs(lastY - startY) > 4) { carried = true; syncOrder(ol, n, false); }
    const raw = top[f] + lastY - startY;
    y = raw < minY ? minY - band(minY - raw) : raw > maxY ? maxY + band(raw - maxY) : raw;
    // A row gives way once the held row's leading edge passes its middle (and comes back a little later than it
    // left, so a finger resting on the line cannot make it flicker). The edge, not the centre, is what makes the
    // first and last slots reachable: the held row never has to travel past the end of the list to claim them.
    let to = f;
    for (let i = 0; i < n; i++) {
      if (i === f) continue;
      const was = moved[i] !== 0, slack = was ? 5 : -5;
      const on = i < f ? y < mid[i] + slack : y + hl > mid[i] - slack;
      const want = on ? (i < f ? step : -step) : 0;
      if (on) to += i < f ? -1 : 1;
      if (want !== moved[i]) { moved[i] = want; rows[i].style.transform = want ? `translate3d(0,${want}px,0)` : ""; }
    }
    if (to !== t) {
      t = to;
      // The numbers follow the slots straight away, so the list always reads 1, 2, 3 from the top.
      for (let i = 0; i < n; i++) { const pos = i === f ? t : i + (moved[i] > 0 ? 1 : moved[i] < 0 ? -1 : 0); const txt = String(pos + 1); if (nums[i].textContent !== txt) nums[i].textContent = txt; }
    }
    li.style.transform = `translate3d(0,${y - top[f]}px,0)`;
  };
  // At most one move per frame, however often the finger reports.
  const mine = ev => ev.pointerId === undefined || ev.pointerId === pid;
  const move = ev => { if (phase !== 1 || !mine(ev)) return; lastY = ev.clientY; if (!raf) raf = requestAnimationFrame(place); };
  const hidden = () => { if (document.hidden) commit(); };
  // Letting go can arrive in many ways on a phone (finger up, the system taking the touch over, a call, the app
  // going to the background, the question changing). Every one of them ends here, and ends the same way.
  const EVS = [["pointerup", true], ["pointercancel", true], ["touchend", false], ["touchcancel", false], ["blur", false], ["pagehide", false]];
  const up = ev => { if (ev.type.startsWith("pointer") && !mine(ev)) return; drop(); };
  const unlisten = () => {
    window.removeEventListener("pointermove", move, true);
    EVS.forEach(([ty, cap]) => window.removeEventListener(ty, up, cap));
    document.removeEventListener("visibilitychange", hidden);
    try { g.releasePointerCapture(pid); } catch (_) {}
  };
  // 1 of 2: the finger is gone. Spring the held row into its slot.
  function drop() {
    if (phase !== 1) return; phase = 2;
    if (raf) cancelAnimationFrame(raf);
    if (li.isConnected) place();
    unlisten();
    if (carried && mouse) ghostUntil = Date.now() + 350;   // a mouse sends a click after the drop: it is not a tap
    if (still || !li.isConnected || document.hidden) return commit();
    const from = y - top[f], to = slotTop(t) - top[f], far = Math.abs(from - to);
    li.style.transform = `translate3d(0,${to}px,0)`;
    if (lift) lift.cancel();
    settle = li.animate([{ transform: `translate3d(0,${from}px,0)`, scale: "1.03" }, { transform: `translate3d(0,${to}px,0)`, scale: "1" }],
      { duration: Math.round(Math.min(420, 260 + far * 1.2)), easing: EASE.drop });
    settle.onfinish = commit;
  }
  // 2 of 2: make it real. The row moves in the list to the slot it is already showing in.
  function commit() {
    if (phase === 3) return; const wasHeld = phase === 1; phase = 3;
    if (DRAG && DRAG.end === commit) DRAG = null;
    dragging = null;
    if (raf) cancelAnimationFrame(raf);
    if (wasHeld) { if (li.isConnected) place(); unlisten(); }
    if (settle) { settle.onfinish = null; settle.cancel(); } if (lift) lift.cancel();
    ol.classList.remove("sorting"); li.classList.remove("drag");
    rows.forEach(r => { r.style.transform = ""; });
    if (!li.isConnected) return;
    if (t !== f) ol.insertBefore(li, t > f ? rows[t].nextSibling : rows[t]);
    syncOrder(ol, carried ? n : k0, carried);
  }
  DRAG = { end: commit };
  // Listen on the window, not the handle: if the phone drops the handle's hold on the finger, the events still arrive.
  window.addEventListener("pointermove", move, true);
  EVS.forEach(([ty, cap]) => window.addEventListener(ty, up, cap));
  document.addEventListener("visibilitychange", hidden);
  if (lastY !== startY) place();
}

/* ---- story-style edge taps: left quarter = back, right quarter = next (or "do this later" if unanswered). No swipes, no centre taps. ---- */
const EDGE = 0.25; // width of each tap zone, as a share of the screen
let tapDown = null, ghostUntil = 0;
document.addEventListener("pointerdown", e => { tapDown = { x: e.clientX, y: e.clientY, t: Date.now() }; }, true);
document.addEventListener("pointerup", e => {
  const d = tapDown; tapDown = null;
  if (!d || !current || !/^#play-/.test(location.hash) || !current.P.round || current.P.round.ended) return;
  const t = e.target && e.target.closest ? e.target : null; if (!t) return;
  if (t.closest("a, summary, .actionbar, .top, .toast, [data-act], [data-go]")) return;
  // Answer options, the ordering list and the hint never navigate, answered or not.
  if (t.closest(".opt, .order, .hint, .sky")) return;
  const dx = e.clientX - d.x, dy = e.clientY - d.y, dt = Date.now() - d.t;
  if (Math.abs(dx) > 10 || Math.abs(dy) > 10 || dt > 450) return;
  if (String(getSelection && getSelection())) return;
  // Only the outer quarter on each side navigates (left = back, right = next). The middle half does nothing.
  const x = e.clientX / innerWidth, dir = x < EDGE ? -1 : x > 1 - EDGE ? 1 : 0;
  if (!dir) return;
  ghostUntil = Date.now() + 250; // the browser sends a click after this tap: swallow it so it can't hit the next screen's option
  if (dir > 0 || current.P.round.i > 0) edgeGlow(dir);
  nav(dir);
});
document.addEventListener("click", e => { if (Date.now() < ghostUntil) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);

/* ---- Kiron 1.4.1: every tap answers. The press itself is CSS (:active, instant). These two play only on a finished tap,
   never on a touch that became a scroll, and move transform or opacity only. ---- */
// Spring back from the pressed size.
document.addEventListener("click", e => {
  const b = e.target && e.target.closest ? e.target.closest(".icon-btn, .actionbar .btn.back, .jump-btn, .part-row") : null;
  if (!b || !b.animate || reduceMotion()) return;
  b.animate([{ transform: `scale(${b.matches(".jump-btn, .part-row") ? .97 : .9})` }, { transform: "none" }], { duration: 340, easing: "cubic-bezier(.3,1.6,.5,1)" });
}, true);
// The side you tapped lights up and fades: two fixed layers, built once.
let EDGES = null;
function edgeGlow(dir) {
  if (reduceMotion() || !document.body.animate) return;
  if (!EDGES || !EDGES[0].isConnected) EDGES = ["l", "r"].map(s => { const el = document.createElement("i"); el.className = "edge " + s; el.setAttribute("aria-hidden", "true"); document.body.append(el); return el; });
  EDGES[dir < 0 ? 0 : 1].animate([{ opacity: 1 }, { opacity: 0 }], { duration: 420, easing: "ease-out" });
}

const slid = v => `translateX(${(v - 100).toFixed(3)}%)`;   // a full-width fill showing v% of the bar
function renderRoundEnd() {
  const { quiz, P } = current, r = P.round;
  clearTimer(); r.ended = true;
  const c = counts(quiz, P), total = c.total || 1;
  const answered = c.right + c.revisit, gNow = answered ? 100 * c.right / answered : 0, rNow = answered ? 100 - gNow : 0;
  const prev = P.ratioPrev || { g: 0, r: 0 };
  P.ratioPrev = { g: gNow, r: rNow }; saveProg();
  const res = Object.values(r.res), missed = res.filter(x => x === "miss" || x === "partial").length;
  const allDone = !c.left && !c.skip;
  // The longest run in this round (a carried-over run counts). Shown from 2 in a row; "longest yet" when it beats this quiz's record.
  const best = r.review ? 0 : r.best || 0, record = P.bestRun || 0, newRec = best >= 3 && best > record && !r.bestShown;
  if (best > record) P.bestRun = best;
  if (newRec) r.bestShown = true; saveProg();
  const bl = heatLevel(best), bestRun = best >= 2 ? `<div class="bestrun${newRec ? " rec" : ""}" data-heat="${bl}"><span class="fl" aria-hidden="true">${heatIcon(Math.max(1, bl))}</span><span><b>${best}</b> in a row</span>${newRec || (r.bestShown && best === P.bestRun) ? `<em>longest yet</em>` : ""}</div>` : "";
  const keep = c.left || c.skip ? `<button class="btn primary xl" data-act="${r.only !== undefined && counts(quiz, P, r.only).left ? "keeppart" : "start"}" type="button">Keep going</button>` : "";
  const rev = missed ? `<button class="btn${keep ? "" : " primary xl"}" data-act="revisitround" type="button">Revisit</button>` : c.revisit ? `<button class="btn${keep ? "" : " primary xl"}" data-act="revisit" type="button">Revisit</button>` : "";
  app().innerHTML = hxAll(`<header class="top play"><div class="top-in"><button class="icon-btn" data-go="quiz-${esc(quiz.id)}" data-replace="1" aria-label="Back to the quiz" type="button">✕</button><div class="dots" role="img" aria-label="Round finished">${r.ids.map(() => `<i class="past"></i>`).join("")}</div><button class="icon-btn done" data-go="quiz-${esc(quiz.id)}" data-replace="1" type="button">Done</button></div></header>
  <main class="wrap play"><div class="endcard">
    <h2 id="endh" tabindex="-1">${allDone ? "End of quiz." : "Round done"}</h2>
    <div class="ratio" role="img" aria-label="Right and wrong answers so far"><i class="g" id="rg" style="transform:${slid(gNow)}"><b aria-hidden="true" style="margin-left:${100 - gNow}%">✓</b></i><i class="r" id="rr" style="transform:${slid(gNow + rNow)}"><b aria-hidden="true">✕</b></i>${answered ? "" : `<span class="empty-r"></span>`}</div>
    ${bestRun}
    <div class="cta">${keep}${rev}</div>
  </div></main>`);
  // Grow from last time's split to this one: the fills slide (transform), the ✓ is held still by an equal and opposite slide.
  const rg = $("#rg"), rr = $("#rr");
  if (rg && rr && rg.animate && !reduceMotion() && (prev.g !== gNow || prev.r !== rNow)) {
    const W = rg.parentNode.getBoundingClientRect().width, e = { duration: 1200, easing: "cubic-bezier(.22,.8,.24,1)" };
    rg.animate([{ transform: slid(prev.g) }, { transform: slid(gNow) }], e);
    rg.firstElementChild.animate([{ transform: `translateX(${((gNow - prev.g) / 100 * W).toFixed(1)}px)` }, { transform: "none" }], e);
    rr.animate([{ transform: slid(prev.g + prev.r) }, { transform: slid(gNow + rNow) }], e);
  }
}

/* ---------------- import / make a quiz: hidden screens (#import, #make) ----------------
   Their code (import.js) and the prompt text (prompt.js) are fetched only when one of them is opened. */
let extras = null;
const loadScript = src => new Promise((ok, no) => { const el = document.createElement("script"); el.src = src; el.onload = ok; el.onerror = no; document.head.append(el); });
function renderExtra(name) {
  current = null;
  if (!extras) extras = Promise.all([loadScript("prompt.js"), loadScript("import.js")]);
  extras.then(() => { if (location.hash === "#" + name) window.KironExtra[name](); }, () => { extras = null; toast("That screen couldn't load. Check your connection."); renderLibrary(); });
}

/* ---------------- events ---------------- */
/* Kiron 1.5.2: one fold for every dropdown (for now: "Jump to a part" and each part inside it).
   A box is three pieces: a head, a list (.unfurl > .fold > .fold-in), and a cap (the rounded bottom edge). To shut, the
   cap slides up; the list's window (.fold) slides up with it while the list inside (.fold-in) slides down by the same
   amount, so the list stands still and is covered from the bottom, right at the cap. Everything after the box rides up
   with the cap, and so does every box it sits inside (their windows and caps too), so a part folding inside the open
   jump box shrinks that box as well. Opening is the same, backwards.
   Every moving piece gets exactly one move, all started together with the same length and curve, so the phone keeps
   them in step by itself; when several boxes move at once (one part opens as another shuts) each piece's move is the
   sum of theirs. Only transforms move. The space is given before opening and taken away only once a box looks
   completely shut, so the page never changes under a moving picture. A tap half-way turns it round from where it is. */
const FOLD_MS = 520, FOLD_EASE = "cubic-bezier(.32,.72,0,1)";
let FOLD = null;   // the fold in progress: { run: [animations], boxes: Map(box -> { H, to }) }
const foldBits = box => { const u = box.querySelector(":scope > .unfurl"), win = u && u.firstElementChild, inner = win && win.firstElementChild; return { u, win, inner, cap: box.querySelector(":scope > .cap") }; };
// What rides when this box folds: whatever follows it, at every level up to the screen, and the window, list and cap of
// every box it sits inside. Returns [element, sign] pairs for the windows and lists (they move by the box's own height).
function foldRiders(box) {
  const { u } = foldBits(box), ride = [], clip = [], root = app();
  for (let n = u; n && n !== root; n = n.parentElement) {
    for (let s = n.nextElementSibling; s; s = s.nextElementSibling) ride.push(s);
    const p = n.parentElement;
    if (p && p.classList.contains("fold-in") && p.parentElement.classList.contains("fold")) clip.push([p.parentElement, -1], [p, 1]);
  }
  return { ride, clip };
}
function unfurl(box, open, show) { fold([[box, open]], show); }
function fold(changes, show) {
  const y0 = window.scrollY;
  // Where every box that is moving now is (how many px it looks shut), read before anything is stopped.
  const boxes = new Map();
  if (FOLD) FOLD.boxes.forEach((b, box) => { if (!box.isConnected) return; const m = new DOMMatrixReadOnly(getComputedStyle(foldBits(box).win).transform); boxes.set(box, { at: -m.m42, to: b.to }); });
  if (FOLD) FOLD.run.forEach(a => { a.onfinish = null; a.cancel(); });
  FOLD = null;
  changes.forEach(([box, open]) => {
    const { u } = foldBits(box); if (!u) return;
    box.classList.toggle("open", open); u.inert = !open;
    const b = boxes.get(box) || { at: u.offsetHeight === 0 ? "shut" : 0 };
    b.open = open; boxes.set(box, b);
  });
  const still = reduceMotion() || !document.body.animate;
  // Give every moving box its full space (the fold draws them shut with transforms), and measure.
  boxes.forEach((b, box) => { const { u } = foldBits(box); u.style.height = "auto"; });
  boxes.forEach((b, box) => {
    const H = b.H = foldBits(box).u.offsetHeight;
    if (b.open === undefined) b.open = b.to === 0;
    b.to = b.open ? 0 : H;
    b.at = b.at === "shut" ? H : Math.min(H, Math.max(0, b.at));
    if (still || !H || b.at === b.to) { if (!b.open) foldBits(box).u.style.height = "0px"; boxes.delete(box); }
  });
  // How far each rider travels when each box shuts (measured by shutting that box for an instant, unseen). Things at
  // the page's foot may not move at all, or only part of the way, so this is measured, not assumed.
  const top = el => el.getBoundingClientRect().top;
  const moves = new Map(), add = (el, from, to) => { const m = moves.get(el) || [0, 0]; m[0] += from; m[1] += to; moves.set(el, m); };
  boxes.forEach((b, box) => {
    const { u, win, inner, cap } = foldBits(box), { ride, clip } = foldRiders(box);
    const t0 = ride.map(top); u.style.height = "0px"; const t1 = ride.map(top); u.style.height = "auto";
    ride.forEach((el, i) => { const k = (t0[i] - t1[i]) / b.H; if (k) add(el, -k * b.at, -k * b.to); });
    add(win, -b.at, -b.to); add(inner, b.at, b.to);
    clip.forEach(([el, s]) => add(el, s * b.at, s * b.to));
  });
  // The page once it has settled: where it ends, and where the box to show sits.
  boxes.forEach((b, box) => { if (!b.open) foldBits(box).u.style.height = "0px"; });
  const end = Math.max(0, document.documentElement.scrollHeight - innerHeight), sr = show && show.isConnected ? show.getBoundingClientRect() : null;
  const r = sr && { top: sr.top + window.scrollY, bottom: sr.bottom + window.scrollY };   // page coordinates
  boxes.forEach((b, box) => { foldBits(box).u.style.height = "auto"; });
  if (window.scrollY !== y0) window.scrollTo(0, y0);
  if (boxes.size) {
    const far = Math.max(...[...boxes.values()].map(b => Math.abs(b.to - b.at) / b.H));
    const o = { duration: Math.round(FOLD_MS * (.45 + .55 * far)), easing: FOLD_EASE, fill: "both" };
    const tr = v => `translate3d(0,${v.toFixed(2)}px,0)`;
    const run = []; moves.forEach(([a, b], el) => { if (a || b) run.push(el.animate([{ transform: tr(a) }, { transform: tr(b) }], o)); });
    const f = FOLD = { run, boxes };
    if (run.length) run[0].onfinish = () => { if (FOLD !== f) return; FOLD = null; boxes.forEach((b, box) => { if (!b.open) foldBits(box).u.style.height = "0px"; }); run.forEach(a => a.cancel()); };
    else FOLD = null;
  }
  // One native smooth scroll, in the same moment: to show what opened, or back if the page would end above where it is.
  let y = Math.min(y0, end);
  if (r) {
    const hdr = $(".top"), hi = (hdr ? hdr.getBoundingClientRect().bottom : 0) + 12, lo = innerHeight - bottomGap();
    if (r.bottom - y0 > lo) y = r.bottom - lo;
    if (r.top - y < hi) y = r.top - hi;
    y = Math.min(end, Math.max(0, y));
  }
  smoothScrollTo(y);
}
/* How much of the bottom of the screen to keep clear when bringing something into view. In a Safari tab the toolbar
   floats over the bottom of the page, so a list scrolled to the very bottom edge would end up under it. On the home
   screen there is only the home bar. */
const STANDALONE = (() => { try { return navigator.standalone === true || matchMedia("(display-mode: standalone)").matches; } catch (e) { return false; } })();
function bottomGap() {
  const safe = parseFloat(getComputedStyle(document.body).paddingBottom) || 0;
  return 24 + (STANDALONE ? safe : Math.max(safe, 34) + 60);
}
let armed = { el: null, t: 0 };
function twoTap(el, label) { if (armed.el === el && Date.now() - armed.t < 4000) { armed = { el: null, t: 0 }; return true; } armed = { el, t: Date.now() }; el.dataset.label = el.textContent; el.textContent = label; setTimeout(() => { if (el.isConnected && armed.el === el) { el.textContent = el.dataset.label; armed = { el: null, t: 0 }; } }, 4000); return false; }
document.addEventListener("click", e => {
  const t = e.target.closest("button, a, [data-go]"); if (!t) return;
  const d = t.dataset;
  if (e.target.classList.contains("hx")) buzz(10);
  if (d.go !== undefined) { flowFrom(t); go(d.go, d.replace !== undefined); return; }
  if (d.del) { if (!twoTap(t, "Tap again to delete")) return; LS.set(K_IMPORTED, getImported().filter(q => q.id !== d.del)); LS.del(progKey(d.del)); toast("Deleted"); go(""); return; }
  if (!current) return;
  if (d.pick !== undefined) return playAct("pick", t);
  if (d.toggle !== undefined) return playAct("toggle", t);
  if (d.act === "jump") { const j = t.closest(".jump"), o = !j.classList.contains("open"); t.setAttribute("aria-expanded", o); unfurl(j, o, o && j); return; }
  // One part open at a time: the one you tap opens (or shuts) while any other open one shuts, all in the same move.
  if (d.act === "partopen") { const p = t.closest(".part"), o = !p.classList.contains("open"), ch = [[p, o]]; app().querySelectorAll(".part.open").forEach(x => { if (x !== p) { ch.push([x, false]); x.querySelector(".part-row").setAttribute("aria-expanded", "false"); } }); t.setAttribute("aria-expanded", o); fold(ch, o && p); return; }
  if (d.act === "partstart") return startRound({ only: +d.pi });
  if (d.act === "partreview") { const { quiz, P } = current, r = buildReview(quiz, P, +d.pi); if (!r) return toast("Nothing answered here yet."); P.round = r; P.cur = null; saveProg(); return go("play-" + quiz.id, true); }
  if (d.act === "partredo") { if (!twoTap(t, "Tap again to redo")) return; const { quiz, P } = current; eachQ(quiz, (q, id, si) => { if (si === +d.pi) { delete P.st[id]; delete P.a[id]; delete P.h[id]; } }); P.round = null; P.cur = null; saveProg(); return startRound({ only: +d.pi }); }
  if (d.act === "keeppart") return startRound({ only: current.P.round.only });
  const act = d.act; if (!act) return;
  if (act === "start") return startRound();
  if (act === "revisit") return startRound({ kind: "revisit" });
  if (act === "revisitround") { const { P } = current; const ids = P.round.ids.filter(x => P.round.res[x] === "miss" || P.round.res[x] === "partial"); ids.forEach(x => { delete P.a[x]; delete P.h[x]; P.n[x] = (P.n[x] || 0) + 1; }); P.round = { ids, i: 0, res: {}, kind: "revisit", streak: 0, ended: false }; P.cur = null; saveProg(); return renderPlay(); }
  if (act === "resume") return go("play-" + current.quiz.id, true);
  if (act === "reset") {
    if (!twoTap(t, "Tap again to reset")) return;
    current.P = blankProg(); saveProg(); t.disabled = true;
    /* The button folds away and a round tick grows in its place. Only transform and opacity move (no width,
       height, border-radius or stroke animation), so iPhone runs it on the compositor at the screen's full rate. */
    const foot = t.parentNode, done = document.createElement("span");
    done.className = "rdone"; done.setAttribute("role", "status");
    done.innerHTML = `<span class="tkw"><svg class="tick" viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 12.5l5 5L19.5 7"/></svg></span><span class="sr">Reset</span>`;
    done.style.top = (t.offsetTop + t.offsetHeight / 2) + "px";
    foot.classList.add("resetting"); t.classList.add("folding"); foot.append(done);
    return setTimeout(() => { if (current && /^#quiz-/.test(location.hash)) renderHome(); }, 900);
  }
  playAct(act, t);
});
/* "Full answer": once it has opened and laid out, glide (native smooth scroll) until the whole answer sits above
   the Next bar, without pushing the "Full answer" line up under the top bar. (scrollIntoView ignored the fixed
   Next bar, so the answer stopped underneath it.) */
document.addEventListener("toggle", e => {
  const d = e.target; if (!d || !d.classList || !d.classList.contains("more")) return;
  const w = d.closest(".wrap.play"); if (w) w.classList.toggle("more-open", d.open);   // room to scroll the full answer up
  if (!d.open) return;
  cancelScroll();
  requestAnimationFrame(() => requestAnimationFrame(() => reveal(d, d.querySelector("summary"))));
}, true);
document.addEventListener("keydown", e => {
  if (!current || !/^#play-/.test(location.hash) || e.metaKey || e.altKey) return;
  const tag = (e.target.tagName || "").toLowerCase();
  const click = sel => { const b = app().querySelector(sel); if (b && !b.disabled) { e.preventDefault(); b.click(); return true; } return false; };
  if (e.key === "Enter") {
    if (tag === "button" || tag === "a" || tag === "summary") return;
    click('[data-act="next"]') || click('[data-act="check"]') || click('.endcard .btn.primary'); return;
  }
  if (e.ctrlKey) return;
  if (e.key === "ArrowLeft") { e.preventDefault(); return nav(-1); }
  if (e.key === "ArrowRight") { e.preventDefault(); return nav(1); }
  if (/^[1-9]$/.test(e.key)) { const opts = app().querySelectorAll(".opts .opt"); const b = opts[+e.key - 1]; if (b && !b.disabled) { e.preventDefault(); b.click(); } return; }
  const k = e.key.toLowerCase();
  if (k === "h") click('[data-act="hint"]'); else if (k === "p") click('[data-act="pause"]');
});

/* ---------------- boot ---------------- */
window.SB = { trouble: TROUBLE, TIME, durOf: durFor, fmt, validateQuiz, formOf, buildRound, nav, streakFeed,
  // what import.js needs from here
  ui: { $, esc, app, topBar, backBtn, toast, go, eachQ, findQuiz, allQuizzes, getImported, saveImported: list => LS.set(K_IMPORTED, list) } };
try { localStorage.removeItem("sb:perf"); } catch (e) {}   // the old performance check's switch, no longer used
route();
loadSamples().then(() => { route(); if (hasSW && navigator.serviceWorker.controller) checkFresh(); });
if (hasSW) {
  try {
    // A new version never reloads the page under someone who is reading or answering. It is picked up the next time
    // the app is opened; if the app is simply left open, it reloads while out of sight, or on the way back to the library.
    const hadSW = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener("controllerchange", () => { if (hadSW) UPDATE = true; });
    navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then(reg => { reg.update().catch(() => {}); }).catch(() => {});
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) updateIfWaiting();
      else navigator.serviceWorker.getRegistration().then(r => r && r.update()).catch(() => {});
    });
  } catch (e) {}
}
})();
