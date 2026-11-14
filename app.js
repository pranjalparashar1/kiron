/* Kiron quiz player: static, no server. Quizzes are JSON; progress lives in this browser. */
(function () {
"use strict";

/* ---------------- storage ---------------- */
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} }
};
const K_IMPORTED = "sb:imported";
const progKey = id => "sb:progress:" + id;

/* ---------------- helpers ---------------- */
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// tiny safe formatting: **bold**, *italic*, line breaks
const fmt = s => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<i>$2</i>").replace(/\n/g, "<br>");
const slug = s => String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "quiz";
let toastT;
function toast(msg) {
  let t = $("#toast");
  if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; t.setAttribute("role", "status"); document.body.append(t); }
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2600);
}
async function copyText(text, fallbackEl) {
  try { await navigator.clipboard.writeText(text); toast("Copied"); return true; }
  catch (e) {
    if (fallbackEl) { const r = document.createRange(); r.selectNodeContents(fallbackEl); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
    toast("Couldn't copy automatically. The text is selected: copy it from the menu.");
    return false;
  }
}

/* ---------------- fuzzy key-point matching (pre-ticks only; the reader confirms) ---------------- */
function norm(s) { return (s || "").toLowerCase().replace(/[’'`]/g, "").replace(/[^a-z0-9.]+/g, " ").replace(/(\d)\.(\d)/g, "$1d$2").replace(/\./g, " ").replace(/\s+/g, " ").trim(); }
function lev(a, b) { if (a === b) return 0; const m = a.length, n = b.length; if (!m) return n; if (!n) return m; let p = Array.from({ length: n + 1 }, (_, j) => j); for (let i = 1; i <= m; i++) { const c = [i]; for (let j = 1; j <= n; j++) c[j] = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); p = c; } return p[n]; }
function wordHit(w, toks) {
  const num = /\d/.test(w);
  const tol = num ? 0 : (w.length >= 8 ? 2 : (w.length >= 5 ? 1 : 0));
  for (const t of toks) {
    if (t === w) return true;
    if (num) continue;
    if (w.length >= 3 && t.startsWith(w)) return true;
    if (tol) { if (lev(w, t) <= tol) return true; if (t.length > w.length && lev(w, t.slice(0, w.length)) <= tol) return true; }
  }
  return false;
}
function phraseHit(phrase, toks) {
  const pn = norm(phrase); if (!pn) return false;
  const ws = pn.split(" ");
  if (ws.length > 1) { const glued = ws.join(""); if (toks.some(t => t.startsWith(glued))) return true; }
  return ws.every(w => wordHit(w, toks));
}
function kpHit(kp, toks) { return !!(kp.match && kp.match.length) && kp.match.some(alt => alt.split("+").every(term => phraseHit(term, toks))); }

/* ---------------- validation ---------------- */
const TYPES = ["text", "single", "multi", "number", "order"];
const TYPE_ALIASES = { mcq: "single", choice: "single", radio: "single", checkbox: "multi", multiple: "multi", num: "number", numeric: "number", calc: "number", calculation: "number", typed: "text", open: "text", short: "text", rank: "order", sequence: "order" };

function parseQuizText(raw) {
  let s = String(raw || "").trim();
  if (!s) return { error: "Nothing to import yet. Paste the quiz text the AI gave you, or choose the file." };
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a < 0 || b < a) return { error: "This doesn't look like a quiz. The quiz text starts with { and ends with }. Copy the whole code block the AI gave you." };
  s = s.slice(a, b + 1);
  const attempts = [s, s.replace(/,\s*([}\]])/g, "$1"), s.replace(/[“”]/g, '"').replace(/,\s*([}\]])/g, "$1")];
  let firstErr;
  for (const t of attempts) { try { return { data: JSON.parse(t) }; } catch (e) { if (!firstErr) firstErr = e; } }
  let where = "";
  const m = String(firstErr && firstErr.message).match(/position (\d+)/);
  if (m) { const p = +m[1]; const line = s.slice(0, p).split("\n").length; where = " Around line " + line + ": “" + s.slice(Math.max(0, p - 40), p + 30).replace(/\s+/g, " ") + "”."; }
  return { error: "The quiz text is incomplete or has a typo, so it can't be read." + where + " This usually means it was cut off while copying, or the AI's reply was too long. Copy the code block again, or ask the AI to send the JSON again in full." };
}

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
      const Q = { type, prompt: isStr(q.prompt) ? q.prompt.trim() : (isStr(q.question) ? q.question.trim() : ""), hint: isStr(q.hint) ? q.hint.trim() : "", answer: isStr(q.answer) ? q.answer.trim() : (isStr(q.explanation) ? q.explanation.trim() : ""), ref: isStr(q.ref) ? q.ref.trim() : "" };
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
      } else if (type === "number") {
        const c = typeof q.correct === "string" ? parseFloat(q.correct.replace(/,/g, "")) : q.correct;
        if (typeof c !== "number" || !isFinite(c)) { errs.push(where + ": “correct” must be a number, like 4.93 (no units or commas)."); return; }
        Q.correct = c;
        const tol = typeof q.tolerance === "string" ? parseFloat(q.tolerance) : q.tolerance;
        Q.tolerance = typeof tol === "number" && isFinite(tol) && tol >= 0 ? tol : Math.max(Math.abs(c) * 0.005, 0.005);
        Q.unit = isStr(q.unit) ? q.unit.trim() : "";
        Q.acceptSign = q.acceptSign === true;
      } else if (type === "order") {
        const items = Array.isArray(q.items) ? q.items.map(x => String(x == null ? "" : x).trim()) : [];
        if (items.length < 2 || items.some(x => !x)) { errs.push(where + ": “items” needs at least two entries, listed in the correct order."); return; }
        Q.items = items;
      } else {
        const kps = Array.isArray(q.keyPoints) ? q.keyPoints : [];
        Q.keyPoints = [];
        kps.forEach((k, ki) => {
          if (typeof k === "string" && k.trim()) Q.keyPoints.push({ text: k.trim(), match: [] });
          else if (k && typeof k === "object" && isStr(k.text)) Q.keyPoints.push({ text: k.text.trim(), match: (Array.isArray(k.match) ? k.match : isStr(k.match) ? [k.match] : []).map(x => String(x).trim()).filter(Boolean) });
          else errs.push(where + ", key point " + (ki + 1) + ": needs some “text”.");
        });
        const need = parseInt(q.need, 10);
        Q.need = Q.keyPoints.length ? (need >= 1 ? Math.min(need, Q.keyPoints.length) : Q.keyPoints.length) : 0;
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
      }
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
const getImported = () => LS.get(K_IMPORTED, []);
function allQuizzes() {
  const imp = getImported().map(q => ({ quiz: q, mine: true }));
  const ids = new Set(imp.map(x => x.quiz.id));
  return imp.concat(SAMPLES.filter(s => !ids.has(s.quiz.id)).map(s => ({ quiz: s.quiz, mine: false })));
}
function findQuiz(id) { return allQuizzes().find(x => x.quiz.id === id); }
async function loadSamples() {
  try {
    const r = await fetch("quizzes.json", { cache: "no-cache" });
    const list = await r.json();
    const got = await Promise.all((list.quizzes || []).map(async f => {
      try { const res = await fetch(f); const v = validateQuiz(await res.json()); return v.quiz ? { file: f, quiz: v.quiz } : null; } catch (e) { return null; }
    }));
    SAMPLES = got.filter(Boolean);
  } catch (e) { SAMPLES = []; }
  samplesLoaded = true;
}

/* ---------------- settings: revision mode and view ---------------- */
const K_SET = "kiron:settings", K_LOG = "kiron:log";
const SET = Object.assign({ mode: null, view: null }, LS.get(K_SET, {}));
const saveSet = () => LS.set(K_SET, SET);
const MODES = {
  early: { name: "Early revision", line: "Tap to answer. No typing or calculating." },
  deep: { name: "In-depth revision", line: "Type your answers to test yourself." }
};
// Switched off for now: the typed "In-depth revision" mode and the activity log. Their code is still here;
// set DEEP_ON / ACTIVITY_ON to true to bring them back (chooser, mode cards, activity screen).
const DEEP_ON = false, ACTIVITY_ON = false;
const mode = () => DEEP_ON && SET.mode === "deep" ? "deep" : "early";
function applyView() { document.documentElement.dataset.view = SET.view || (window.innerWidth >= 900 ? "laptop" : "phone"); }
const curView = () => document.documentElement.dataset.view;
window.addEventListener("resize", () => { if (!SET.view) applyView(); });

/* ---------------- activity log (stays on this device; lets you see if you get past 3 questions) ---------------- */
const SESSION_GAP = 30 * 60 * 1000;
function logEvent(kind, quizId) {
  if (!ACTIVITY_ON) return;
  const log = LS.get(K_LOG, []);
  const now = Date.now();
  let s = log[log.length - 1];
  if (!s || now - s.t1 > SESSION_GAP) { s = { t0: now, t1: now, n: 0, right: 0, skip: 0, mode: mode(), quiz: quizId }; log.push(s); }
  s.t1 = now; s.mode = mode(); s.quiz = quizId;
  if (kind === "skip") s.skip++; else { s.n++; if (kind === "right") s.right++; }
  LS.set(K_LOG, log.slice(-80));
}
function logSummary() {
  const log = LS.get(K_LOG, []).filter(s => s.n + s.skip > 0);
  const today = new Date().toDateString();
  const todayN = log.filter(s => new Date(s.t0).toDateString() === today).reduce((a, s) => a + s.n, 0);
  const past3 = log.filter(s => s.n > 3).length;
  const avg = log.length ? log.reduce((a, s) => a + s.n, 0) / log.length : 0;
  return { log, todayN, past3, avg, best: log.reduce((a, s) => Math.max(a, s.n), 0) };
}

/* ---------------- progress + grading ---------------- */
const ROUND = 7;
const progKey2 = (id, m) => "sb:p2:" + id + ":" + m;
const blankProg = () => ({ st: {}, a: {}, h: {}, n: {}, round: null, cur: null, seen: 0 });
function getProg(id, m) { return Object.assign(blankProg(), LS.get(progKey2(id, m || mode()), {})); }
function saveProg() { if (!current) return; current.P.seen = Date.now(); LS.set(progKey2(current.quiz.id, current.mode), current.P); }
const qid = (si, qi) => "s" + si + "q" + qi;
function eachQ(quiz, fn) { quiz.sections.forEach((s, si) => s.questions.forEach((q, qi) => fn(q, qid(si, qi), si, qi))); }
function getQ(quiz, id) { const m = id.match(/^s(\d+)q(\d+)$/); const si = +m[1], qi = +m[2]; return { q: quiz.sections[si].questions[qi], id, si, qi }; }

function shuffledOrder(seedStr, n) {
  const idx = [...Array(n).keys()];
  let seed = 0; for (const ch of seedStr) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0; seed = seed || 7;
  for (let i = n - 1; i > 0; i--) { seed = (seed * 1103515245 + 12345) >>> 0; const j = (seed >>> 8) % (i + 1); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  return idx;
}
function orderStart(id, n) { const o = shuffledOrder(id, n); if (o.every((v, i) => v === i)) o.reverse(); return o; }
function parseNum(v) { const s = String(v == null ? "" : v).replace(/,/g, "").replace(/[−–—]/g, "-"); const m = s.match(/-?\d*\.?\d+/); return m ? parseFloat(m[0]) : null; }
function autoTicks(q, text) {
  const toks = norm(text).split(" ").filter(Boolean); const out = [];
  if (toks.length) q.keyPoints.forEach((k, i) => { if (kpHit(k, toks)) out.push(i); });
  return out;
}
// How a question is shown in the current mode.
function formOf(q, m) {
  if (q.type === "single") return { kind: "pick", prompt: q.prompt, options: q.options, correct: q.correct, why: q.answer, more: "" };
  if (m === "early") {
    if (q.mcq) return { kind: "pick", prompt: q.mcq.prompt || q.prompt, options: q.mcq.options, correct: q.mcq.correct, why: q.mcq.why || q.answer, more: q.mcq.why ? q.answer : "", setup: q.type === "number" && !q.mcq.prompt };
    if (q.type === "multi" || q.type === "order") return { kind: q.type, prompt: q.prompt };
    return { kind: "flip", prompt: q.prompt };
  }
  return { kind: q.type, prompt: q.prompt };
}
const lacksTap = q => (q.type === "text" || q.type === "number") && !q.mcq;
function gradeMulti(q, v) { const sel = new Set(v || []), cor = new Set(q.correct); let g = 0, b = 0; sel.forEach(i => cor.has(i) ? g++ : b++); if (g === cor.size && !b) return "right"; return (g - b) / cor.size >= 0.5 ? "partial" : "miss"; }
function gradeOrder(q, ord) { let k = 0; ord.forEach((it, i) => { if (it === i) k++; }); return k === q.items.length ? "right" : (k / q.items.length >= 0.5 ? "partial" : "miss"); }
function gradeNumber(q, v) { const x = parseNum(v); if (x === null) return "miss"; let ok = Math.abs(x - q.correct) <= q.tolerance + 1e-9; if (!ok && q.acceptSign) ok = Math.abs(Math.abs(x) - Math.abs(q.correct)) <= q.tolerance + 1e-9; return ok ? "right" : "miss"; }
function gradeTicks(q, ticks) { const n = ticks.length, need = q.need || q.keyPoints.length; return n >= need ? "right" : (n > 0 && n >= need / 2 ? "partial" : "miss"); }
function counts(quiz, P, si) {
  const c = { right: 0, revisit: 0, skip: 0, left: 0, total: 0 };
  eachQ(quiz, (q, id, s) => { if (si !== undefined && s !== si) return; c.total++; const v = P.st[id]; if (v === "right") c.right++; else if (v === "partial" || v === "miss") c.revisit++; else if (v === "skip") c.skip++; else c.left++; });
  return c;
}
function buildRound(quiz, P, opt) {
  opt = opt || {};
  const all = []; eachQ(quiz, (q, id, si) => all.push({ id, si }));
  const pick = (test, from) => { let list = all.filter(x => test(P.st[x.id])); if (from !== undefined) { const a = list.filter(x => x.si >= from), b = list.filter(x => x.si < from); list = a.concat(b); } return list.slice(0, ROUND).map(x => x.id); };
  let ids = [], kind = "new";
  if (opt.kind === "revisit") { ids = pick(v => v === "miss" || v === "partial", opt.from); kind = "revisit"; }
  else {
    ids = pick(v => !v, opt.from);
    if (!ids.length) { ids = pick(v => v === "skip"); kind = "skipped"; }
    if (!ids.length) { ids = pick(v => v === "miss" || v === "partial"); kind = "revisit"; }
  }
  if (!ids.length) return null;
  ids.forEach(id => { delete P.a[id]; delete P.h[id]; P.n[id] = (P.n[id] || 0) + 1; });
  return { ids, i: 0, res: {}, kind, streak: 0, ended: false };
}

/* ---------------- routing ---------------- */
let current = null; // { quiz, mine, P, mode }
const app = () => $("#app");
function openQuiz(id) {
  const found = findQuiz(id); if (!found) return null;
  current = { quiz: found.quiz, mine: found.mine, mode: mode(), P: getProg(found.quiz.id) };
  return current;
}
function route() {
  applyView();
  const h = decodeURIComponent((location.hash || "").replace(/^#/, ""));
  if (DEEP_ON && !SET.mode) return renderChooser();
  if (h === "import") return renderImport();
  if (h === "make") return renderMake();
  if (ACTIVITY_ON && h === "activity") return renderActivity();
  const m = h.match(/^(quiz|play)-(.+)$/);
  if (m) {
    if (openQuiz(m[2])) return m[1] === "play" ? renderPlay() : renderHome();
    if (!samplesLoaded) return;
    toast("That quiz isn't on this device. Import it first.");
  }
  renderLibrary();
}
function go(h) { if (location.hash === "#" + h || (!h && !location.hash)) { route(); window.scrollTo(0, 0); } else location.hash = h; }
window.addEventListener("hashchange", () => { route(); window.scrollTo(0, 0); });
const topBar = (left, title, right) => `<header class="top"><div class="top-in">${left || ""}${title}${right || ""}</div></header>`;
const backBtn = (to, label) => `<button class="icon-btn" data-go="${to || ""}" aria-label="${label || "Back to library"}" type="button">←</button>`;
const seg = (name, cur, opts) => `<div class="seg" role="group" aria-label="${name}">${opts.map(o => `<button type="button" class="${o[0] === cur ? "on" : ""}" aria-pressed="${o[0] === cur}" data-set-${name}="${o[0]}">${o[1]}</button>`).join("")}</div>`;
const modeCards = () => `<div class="modes">${Object.keys(MODES).map(k => `<button type="button" class="mode${SET.mode === k ? " on" : ""}" aria-pressed="${SET.mode === k}" data-set-mode="${k}"><b>${MODES[k].name}</b><span>${MODES[k].line}</span></button>`).join("")}</div>`;

/* ---------------- first launch ---------------- */
function renderChooser() {
  current = null; document.title = "Kiron";
  app().innerHTML = `<main class="wrap chooser">
    <div class="brand big"><img src="icon-192.png" alt="">Kiron</div>
    <h2 tabindex="-1">How do you want to revise today?</h2>
    ${modeCards()}
    <p class="note">Both use the same questions. You can switch whenever you like.</p>
  </main>`;
}

/* ---------------- library: just the list ---------------- */
const viewBtn = () => { const to = curView() === "laptop" ? "phone" : "laptop"; return `<button class="icon-btn" data-set-view="${to}" aria-label="Switch to ${to} layout" type="button">${to === "phone" ? "📱" : "💻"}</button>`; };
function renderLibrary() {
  current = null; document.title = "Kiron";
  const list = allQuizzes();
  app().innerHTML = topBar("", `<div class="brand"><img src="icon-192.png" alt="">Kiron</div>`, viewBtn()) + `
  <main class="wrap lib">
    <h1 class="pick">Pick your quiz</h1>
    <div class="grid">${list.length ? list.map(x => `<button class="card qcard" data-go="quiz-${esc(x.quiz.id)}" type="button"><h3>${esc(x.quiz.title)}</h3><span class="chev" aria-hidden="true">›</span></button>`).join("") : `<p class="empty">${samplesLoaded ? "No quizzes yet." : "Loading…"}</p>`}</div>
  </main>`;
}
function segBar(c) {
  const w = n => (c.total ? 100 * n / c.total : 0) + "%";
  return `<div class="bar3" role="img" aria-label="${c.right} got, ${c.revisit} to revisit, ${c.skip} skipped, ${c.left} to go"><i class="g" style="width:${w(c.right)}"></i><i class="r" style="width:${w(c.revisit)}"></i><i class="s" style="width:${w(c.skip)}"></i></div>`;
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
  else primary = `<div class="donebox"><b>That's the whole quiz.</b></div>`;
  const parts = quiz.sections.map((s, i) => { const pc = counts(quiz, P, i); return `<button class="part" type="button" data-part="${i}"><span class="pn">${pc.total && pc.right === pc.total ? "✓" : i + 1}</span><b>${esc(s.title)}</b></button>`; }).join("");
  app().innerHTML = topBar(backBtn(), `<span class="grow"></span>`, viewBtn()) + `
  <main class="wrap home">
    <div class="cta">${primary}${c.revisit && (inRound || c.left || c.skip) ? `<button class="btn" data-act="revisit" type="button">Revisit what you missed</button>` : ""}</div>
    ${quiz.sections.length > 1 ? `<details class="jump"><summary>Jump to a part</summary><div class="parts">${parts}</div></details>` : ""}
    <div class="foot">${started || inRound ? `<button class="btn ghost danger" data-act="reset" type="button">Reset quiz</button>` : ""}${mine ? `<button class="btn ghost danger" data-del="${esc(quiz.id)}" type="button">Delete this quiz</button>` : ""}</div>
  </main>`;
}
function startRound(opt) {
  const { quiz, P } = current;
  const r = buildRound(quiz, P, opt);
  if (!r) { toast("Nothing left there. Nice."); return; }
  P.round = r; P.cur = null; saveProg(); go("play-" + quiz.id);
}

/* ---------------- player: one question per screen ---------------- */
let FX = null;      // one-shot effect for the next render: { kind: "right" | "wrong" | "mixed", oi }
let DIR = 0;        // which way we just moved: 1 = forward, -1 = back (for the slide-in)
const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const buzz = ms => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} };
function renderPlay(keepScroll) {
  const { quiz, P } = current;
  const r = P.round;
  if (!r) return go("quiz-" + quiz.id);
  document.title = quiz.title + " · Kiron";
  if (r.ended || r.i >= r.ids.length) return renderRoundEnd();
  const y0 = window.scrollY;
  const { q, id } = getQ(quiz, r.ids[r.i]);
  if (!P.cur || P.cur.id !== id) {
    const was = r.res[id];
    P.cur = was && was !== "skip" && P.a[id] !== undefined ? { id, done: true, status: was, revealed: true, ticks: [] } : { id, done: false };
  }
  const cur = P.cur, f = formOf(q, current.mode);
  const fx = FX && FX.id === id ? FX : null; FX = null;
  const dots = r.ids.map((x, i) => `<i class="${i < r.i ? (r.res[x] === "skip" ? "skip" : "past") : i === r.i ? "now" + (cur.done ? " full" : "") : ""}"></i>`).join("");
  const status = cur.done ? cur.status : null;
  let input = "", primary = "";
  const a = P.a[id];
  if (f.kind === "pick") {
    const ord = /\b(all|none|both) of|\babove\b|\bboth [a-d]\b/i.test(f.options.join(" ")) ? f.options.map((_, i) => i) : shuffledOrder(id + ":" + (P.n[id] || 0), f.options.length);
    input = `<div class="opts" role="group" aria-label="Options">` + ord.map((oi, pos) => {
      let cls = "opt", ic = "";
      if (cur.done) { if (oi === f.correct) { cls += " ok"; ic = "✓"; } else if (a === oi) { cls += " wrong"; ic = "✕"; } else cls += " dim"; }
      if (fx && fx.oi === oi) cls += fx.kind === "right" ? " pop" : " shake";
      return `<button type="button" class="${cls}" data-pick="${oi}"${cur.done ? " disabled" : ""}><span class="k${ic ? " ic" : ""}">${ic || pos + 1}</span><span>${fmt(f.options[oi])}</span></button>`;
    }).join("") + `</div>`;
  } else if (f.kind === "multi") {
    const sel = a || [];
    input = `<p class="lead">Pick all that apply.</p><div class="opts" role="group" aria-label="Options">` + q.options.map((o, i) => {
      let cls = "opt" + (sel.includes(i) ? " sel" : ""), ic = sel.includes(i) ? "✓" : "";
      if (cur.done) { const right = q.correct.includes(i), ch = sel.includes(i); cls = "opt" + (ch && right ? " ok" : ch ? " wrong" : right ? " missed" : " dim"); ic = ch && right ? "✓" : ch ? "✕" : right ? "✓" : ""; }
      return `<button type="button" class="${cls}" data-toggle="${i}" aria-pressed="${sel.includes(i)}"${cur.done ? " disabled" : ""}><span class="k box${cur.done && ic ? " ic" : ""}">${ic}</span><span>${fmt(o)}</span></button>`;
    }).join("") + `</div>`;
    primary = "check";
  } else if (f.kind === "order") {
    const ord = a || orderStart(id, q.items.length);
    input = `<p class="lead">${cur.done ? "Your order:" : "Drag the handle, or tap the arrows."}</p><ol class="order${cur.done ? " done" : ""}">` + ord.map((it, pos) => {
      const ok = cur.done && it === pos;
      return `<li data-it="${it}" class="${cur.done ? (ok ? "ok" : "wrong") : ""}">${cur.done ? "" : `<span class="grip" aria-hidden="true">⠿</span>`}<span class="p">${cur.done ? (ok ? "✓" : "✕") : pos + 1}</span><span class="t">${fmt(q.items[it])}</span>${cur.done ? "" : `<button class="mv up" type="button" data-mv="-1" aria-label="Move up"${pos === 0 ? " disabled" : ""}>▲</button><button class="mv dn" type="button" data-mv="1" aria-label="Move down"${pos === ord.length - 1 ? " disabled" : ""}>▼</button>`}</li>`;
    }).join("") + `</ol>`;
    primary = "check";
  } else if (f.kind === "flip") {
    input = cur.revealed ? "" : `<p class="lead">Say the answer in your head, then flip.</p>`;
    primary = cur.revealed ? "" : "flip";
  } else if (f.kind === "text") {
    input = `<textarea id="ans" data-in="1" placeholder="Type what you remember. Rough is fine." aria-label="Your answer"${cur.done ? " readonly" : ""}>${esc(a || "")}</textarea>`;
    primary = cur.revealed ? "" : "check";
  } else if (f.kind === "number") {
    input = `<div class="row"><input class="num" id="ans" type="text" inputmode="decimal" autocomplete="off" data-in="1" value="${esc(a || "")}" placeholder="Your answer" aria-label="Your answer"${cur.done ? " readonly" : ""}>${q.unit ? `<span class="unit">${esc(q.unit)}</span>` : ""}</div>`;
    primary = "check";
  }
  const hint = q.hint && P.h[id] ? `<div class="hint"><b>Hint</b>${fmt(q.hint)}</div>` : "";
  // feedback: the explanation only (no verdict banner)
  let fb = "";
  if (cur.done || cur.revealed) {
    let detail = "", why = f.kind === "pick" ? f.why : q.answer, more = f.kind === "pick" ? f.more : "";
    if (f.kind === "text" && q.keyPoints.length) {
      const ticks = cur.ticks || [], need = q.need || q.keyPoints.length;
      detail = `<p class="lead">Tick what you covered${need < q.keyPoints.length ? ` (${need} of ${q.keyPoints.length} is enough)` : ""}:</p><div class="kps">` + q.keyPoints.map((k, i) => `<button type="button" class="kp${ticks.includes(i) ? " on" : ""}" data-kp="${i}" aria-pressed="${ticks.includes(i)}"><span class="k box">${ticks.includes(i) ? "✓" : ""}</span><span>${fmt(k.text)}</span></button>`).join("") + `</div>`;
    } else if (f.kind === "number") {
      const x = parseNum(a);
      detail = `<div class="yours">You: <b>${x === null ? "no answer" : esc(String(x))}</b> · Answer: <b>${esc(String(q.correct))}${q.unit ? " " + esc(q.unit) : ""}</b></div>${status !== "right" ? `<button class="btn small ghost" type="button" data-act="ihadit">I had this</button>` : ""}`;
    } else if (f.kind === "order" && status !== "right") {
      detail = `<div class="yours">Right order: ${q.items.map((t, i) => `${i + 1}. ${fmt(t)}`).join(" · ")}</div>`;
    }
    const selfMark = (f.kind === "flip" || (f.kind === "text" && !q.keyPoints.length)) ? `<p class="lead">How did you do?</p><div class="selfmark">${[["right", "Got it"], ["partial", "Nearly"], ["miss", "Not yet"]].map(k => `<button class="btn${status === k[0] ? " on" : ""}" type="button" data-self="${k[0]}">${k[1]}</button>`).join("")}</div>` : "";
    fb = `<section class="fb ${status || "open"}" aria-live="polite">${detail}<div class="model"><span class="k">${f.kind === "pick" || f.kind === "multi" || f.kind === "order" ? "Why" : "Answer"}</span>${fmt(why)}</div>${more ? `<details class="more"><summary>Full answer</summary><p>${fmt(more)}</p></details>` : ""}${selfMark}</section>`;
  }
  const needsSelf = (cur.revealed && !cur.done);
  const back = r.i > 0 ? `<button class="btn ghost back" data-act="back" aria-label="Previous question" type="button">‹</button>` : "";
  const hintBtn = q.hint && !P.h[id] && !cur.done ? `<button class="btn ghost${primary ? "" : " grow"}" data-act="hint" type="button">💡 Hint</button>` : "";
  const nudge = status && status !== "right" ? " pulse" : "";
  const bar = cur.done
    ? `${back}<button class="btn primary grow${nudge}" data-act="next" type="button">${r.i + 1 >= r.ids.length ? "Finish" : "Next"}</button>`
    : `${back}${hintBtn}${primary === "check" ? `<button class="btn primary grow" data-act="check" type="button">Check</button>` : primary === "flip" ? `<button class="btn primary grow" data-act="flip" type="button">Show answer</button>` : needsSelf ? `<span class="grow note">Mark yourself to continue</span>` : ""}`;
  const long = f.prompt.length > 150 ? " long" : "";
  app().innerHTML = `<header class="top play"><div class="top-in"><button class="icon-btn" data-go="quiz-${esc(quiz.id)}" aria-label="Leave this round" type="button">✕</button><div class="dots" role="img" aria-label="Question ${r.i + 1} of ${r.ids.length}">${dots}</div></div></header>
  <main class="wrap play">
    <div class="stage">
      <article class="qcardp${DIR > 0 ? " in-next" : DIR < 0 ? " in-prev" : ""}">
        <h2 class="prompt${long}" id="qprompt" tabindex="-1">${fmt(f.prompt)}</h2>
        ${f.setup ? `<p class="lead setup">No calculating. Pick the setup that gives the answer.</p>` : ""}
        ${hint}${input}${fb}
      </article>
    </div>
  </main>
  ${bar.trim() ? `<div class="actionbar"><div class="actionbar-in">${bar}</div></div>` : ""}`;
  DIR = 0;
  if (!keepScroll) window.scrollTo(0, 0);
  else {
    window.scrollTo(0, y0);
    const el = app().querySelector(".fb");
    if (keepScroll === "fb" && el) {
      const wrong = status && status !== "right";
      // a wrong answer: let the shake play, then bring the explanation into view
      setTimeout(() => { if (el.isConnected) el.scrollIntoView({ block: wrong ? "start" : "nearest", behavior: reduceMotion() ? "auto" : "smooth" }); }, wrong && !reduceMotion() ? 480 : 60);
    }
  }
  if (fx && fx.kind === "right") { const ok = app().querySelector(".opt.ok"); if (ok) burst(ok); if (r.streak >= 3) streakPill(r.streak); }
}
function burst(el) {
  if (reduceMotion()) return;
  const b = el.getBoundingClientRect(), cols = ["#f5b700", "#ff6b6b", "#3a4fd0", "#1fa463", "#b46bff"];
  for (let i = 0; i < 16; i++) {
    const p = document.createElement("i"); p.className = "conf";
    const ang = (Math.PI * 2 * i) / 16 + Math.random() * .4, d = 50 + Math.random() * 70;
    p.style.cssText = `left:${b.right - 28}px;top:${b.top + b.height / 2}px;background:${cols[i % cols.length]};--dx:${Math.cos(ang) * d}px;--dy:${Math.sin(ang) * d - 20}px`;
    document.body.append(p); setTimeout(() => p.remove(), 800);
  }
}
function streakPill(n) {
  const old = $("#streak"); if (old) old.remove();
  const el = document.createElement("div"); el.id = "streak"; el.className = "streak"; el.textContent = "🔥 " + n + " in a row";
  document.body.append(el); setTimeout(() => el.remove(), 1700);
}
function finalize(status) {
  const { quiz, P } = current, r = P.round, id = P.cur.id;
  const first = !P.cur.done;
  P.cur.done = true; P.cur.status = status;
  P.st[id] = status; r.res[id] = status;
  if (first) { r.streak = status === "right" ? (r.streak || 0) + 1 : 0; logEvent(status === "right" ? "right" : "other", quiz.id); }
  else if (status !== "right") r.streak = 0;
  saveProg();
}
// Story-style moves: forward (answered: next; unanswered: leave it for later) and back.
function nav(dir) {
  if (!current) return;
  const { quiz, P } = current, r = P.round; if (!r || r.ended || r.i >= r.ids.length) return;
  const id = r.ids[r.i];
  if (dir < 0) { if (r.i === 0) return; r.i--; P.cur = null; DIR = -1; saveProg(); return renderPlay(); }
  if (!P.cur || !P.cur.done) { if (!P.st[id]) P.st[id] = "skip"; r.res[id] = "skip"; logEvent("skip", quiz.id); }
  r.i++; P.cur = null; DIR = 1; if (r.i >= r.ids.length) r.ended = true;
  saveProg(); renderPlay(); const h = $("#qprompt") || $("#endh"); if (h) h.focus({ preventScroll: true });
}
function playAct(act, el) {
  const { quiz, P } = current, r = P.round; if (!r) return;
  if (r.ended || r.i >= r.ids.length) return;
  const cur = P.cur, { q, id } = getQ(quiz, r.ids[r.i]), f = formOf(q, current.mode);
  if (act === "pick") { if (cur.done) return; const oi = +el.dataset.pick; P.a[id] = oi; const ok = oi === f.correct; finalize(ok ? "right" : "miss"); FX = { id, kind: ok ? "right" : "wrong", oi }; buzz(ok ? 12 : [30, 40, 30]); return renderPlay("fb"); }
  if (act === "toggle") { if (cur.done) return; const i = +el.dataset.toggle, s = new Set(P.a[id] || []); s.has(i) ? s.delete(i) : s.add(i); P.a[id] = [...s].sort((x, y) => x - y); saveProg(); renderPlay(true); const b = app().querySelector(`[data-toggle="${i}"]`); if (b) b.focus(); return; }
  if (act === "hint") { P.h[id] = true; saveProg(); renderPlay(true); const h = app().querySelector(".hint"); if (h) h.scrollIntoView({ block: "nearest" }); return; }
  if (act === "back") return nav(-1);
  if (act === "flip") { cur.revealed = true; saveProg(); return renderPlay("fb"); }
  if (act === "self") { finalize(el.dataset.self); return renderPlay(true); }
  if (act === "check") {
    if (cur.done) return;
    if (f.kind === "multi") { finalize(gradeMulti(q, P.a[id])); buzz(12); }
    else if (f.kind === "order") { if (!P.a[id]) P.a[id] = orderStart(id, q.items.length); finalize(gradeOrder(q, P.a[id])); }
    else if (f.kind === "number") finalize(gradeNumber(q, P.a[id]));
    else if (f.kind === "text") {
      if (q.keyPoints.length) { cur.ticks = autoTicks(q, P.a[id]); finalize(gradeTicks(q, cur.ticks)); }
      else { cur.revealed = true; saveProg(); }
    }
    return renderPlay("fb");
  }
  if (act === "kp") { const i = +el.dataset.kp, s = new Set(cur.ticks || []); s.has(i) ? s.delete(i) : s.add(i); cur.ticks = [...s].sort((x, y) => x - y); finalize(gradeTicks(q, cur.ticks)); renderPlay(true); const b = app().querySelector(`[data-kp="${i}"]`); if (b) b.focus(); return; }
  if (act === "ihadit") { finalize("right"); return renderPlay(true); }
  if (act === "next") { if (!cur.done) return; return nav(1); }
}

/* ---- reordering: tap arrows (animated) or drag the handle; both move the real list item ---- */
let dragging = null;
function syncOrder(ol, save) {
  const kids = [...ol.children];
  kids.forEach((li, i) => { li.querySelector(".p").textContent = i + 1; li.querySelector(".up").disabled = i === 0; li.querySelector(".dn").disabled = i === kids.length - 1; });
  if (save && current && current.P.cur) { current.P.a[current.P.cur.id] = kids.map(li => +li.dataset.it); saveProg(); }
}
function moveLi(ol, li, to) {
  const kids = [...ol.children], from = kids.indexOf(li);
  if (to < 0 || to >= kids.length || to === from) return false;
  const before = new Map(kids.map(k => [k, k.getBoundingClientRect().top]));
  ol.insertBefore(li, to > from ? kids[to].nextSibling : kids[to]);
  if (!reduceMotion()) kids.forEach(k => { if (k === dragging) return; const d = before.get(k) - k.getBoundingClientRect().top; if (d) k.animate([{ transform: `translateY(${d}px)` }, { transform: "none" }], { duration: 240, easing: "cubic-bezier(.2,.8,.2,1)" }); });
  return true;
}
function flash(li) { li.classList.remove("moved"); void li.offsetWidth; li.classList.add("moved"); }
function arrowMove(btn) {
  const li = btn.closest("li"), ol = li.parentElement, dir = +btn.dataset.mv, i = [...ol.children].indexOf(li);
  if (!moveLi(ol, li, i + dir)) return;
  syncOrder(ol, true); flash(li); buzz(8);
  const nb = li.querySelector(btn.classList.contains("up") ? ".up" : ".dn"); (nb && !nb.disabled ? nb : li.querySelector(".mv:not(:disabled)")) ?.focus({ preventScroll: true });
}
document.addEventListener("pointerdown", e => {
  const g = e.target.closest && e.target.closest(".order .grip"); if (!g || !current) return;
  const li = g.closest("li"), ol = li.parentElement; e.preventDefault();
  const startY = e.clientY, startTop = li.offsetTop; dragging = li; li.classList.add("drag");
  try { g.setPointerCapture(e.pointerId); } catch (_) {}
  const place = ev => {
    for (let n = 0; n < 6; n++) {
      const dy = ev.clientY - startY - (li.offsetTop - startTop), cy = li.offsetTop + li.offsetHeight / 2 + dy;
      const prev = li.previousElementSibling, next = li.nextElementSibling, idx = [...ol.children].indexOf(li);
      if (prev && cy < prev.offsetTop + prev.offsetHeight / 2) { moveLi(ol, li, idx - 1); buzz(6); continue; }
      if (next && cy > next.offsetTop + next.offsetHeight / 2) { moveLi(ol, li, idx + 1); buzz(6); continue; }
      break;
    }
    li.style.transform = `translateY(${ev.clientY - startY - (li.offsetTop - startTop)}px)`;
  };
  const move = ev => place(ev);
  const up = () => { g.removeEventListener("pointermove", move); g.removeEventListener("pointerup", up); g.removeEventListener("pointercancel", up); dragging = null; li.classList.remove("drag"); li.style.transform = ""; syncOrder(ol, true); flash(li); };
  g.addEventListener("pointermove", move); g.addEventListener("pointerup", up); g.addEventListener("pointercancel", up);
});

/* ---- story-style side taps: left = back, right = next (or "do this later" if unanswered) ---- */
let tapDown = null;
document.addEventListener("pointerdown", e => { tapDown = { x: e.clientX, y: e.clientY, t: Date.now() }; }, true);
document.addEventListener("pointerup", e => {
  const d = tapDown; tapDown = null;
  if (!d || !current || !/^#play-/.test(location.hash) || !current.P.round || current.P.round.ended) return;
  if (Math.abs(e.clientX - d.x) > 10 || Math.abs(e.clientY - d.y) > 10 || Date.now() - d.t > 450) return;
  if (e.target.closest && e.target.closest("button, a, summary, details, input, textarea, label, .fb, .hint, .order, .actionbar, .top, .toast")) return;
  if (String(getSelection && getSelection())) return;
  ghostUntil = Date.now() + 250; // the browser sends a click after this tap: swallow it so it can't hit the next screen's option
  nav(e.clientX < innerWidth * 0.35 ? -1 : 1);
});
let ghostUntil = 0;
document.addEventListener("click", e => { if (Date.now() < ghostUntil) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);

function renderRoundEnd() {
  const { quiz, P } = current, r = P.round;
  r.ended = true; saveProg();
  const res = Object.values(r.res), n = k => res.filter(x => x === k).length;
  const got = n("right"), rev = n("partial") + n("miss"), sk = n("skip"), answered = got + rev;
  const c = counts(quiz, P);
  const line = !answered ? "No answers this round. That's fine: the skipped ones will come back." : got === answered ? "Clean round." : got >= answered / 2 ? "Good round. The rest are saved to revisit." : "That's what revision is for. They're saved to revisit.";
  const allDone = !c.left && !c.skip && !c.revisit;
  let next;
  if (c.left) next = `<button class="btn primary xl" data-act="start" type="button">Keep going: next ${Math.min(ROUND, c.left)}</button>`;
  else if (c.skip) next = `<button class="btn primary xl" data-act="start" type="button">Try the ${c.skip} you skipped</button>`;
  else if (c.revisit) next = `<button class="btn primary xl" data-act="revisit" type="button">Revisit ${c.revisit}</button>`;
  else next = "";
  app().innerHTML = `<header class="top play"><div class="top-in"><button class="icon-btn" data-go="quiz-${esc(quiz.id)}" aria-label="Back to quiz" type="button">✕</button><div class="dots" role="img" aria-label="Round finished">${r.ids.map(x => `<i class="${r.res[x] || "skip"}"></i>`).join("")}</div><span class="count">Done</span></div></header>
  <main class="wrap play"><div class="endcard">
    <h2 id="endh" tabindex="-1">${allDone ? "That's the whole quiz." : "Round done"}</h2>
    <div class="big3"><div><b>${got}</b><span>got it</span></div><div><b>${rev}</b><span>to revisit</span></div><div><b>${sk}</b><span>skipped</span></div></div>
    <p>${allDone ? `All ${c.total} questions done. Come back in a few days and see what stuck.` : line}</p>
    <div class="status">${segBar(c)}<div class="legend"><span><i class="g"></i>${c.right} got it</span><span><i class="r"></i>${c.revisit} to revisit</span><span><i class="l"></i>${c.left + c.skip} to go</span></div></div>
    <div class="cta">${next}${rev && c.left ? `<button class="btn" data-act="revisitround" type="button">Revisit this round's ${rev} first</button>` : ""}<button class="btn ghost" data-go="quiz-${esc(quiz.id)}" type="button">${allDone ? "Back to the quiz" : "Take a break"}</button></div>
  </div></main>`;
}

/* ---------------- activity ---------------- */
function renderActivity() {
  current = null; document.title = "Activity · Kiron";
  const s = logSummary(), rows = s.log.slice(-12).reverse();
  const fmtD = t => new Date(t).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  const text = "Kiron activity\nSessions: " + s.log.length + "\nSessions past 3 questions: " + s.past3 + "\nAverage questions per session: " + s.avg.toFixed(1) + "\nBest session: " + s.best + "\n" + rows.map(r => `${fmtD(r.t0)} | ${r.n} answered, ${r.right} got, ${r.skip} skipped | ${Math.max(1, Math.round((r.t1 - r.t0) / 60000))} min | ${MODES[r.mode] ? MODES[r.mode].name : r.mode}`).join("\n");
  app().innerHTML = topBar(backBtn(), `<h1>Activity</h1>`) + `<main class="wrap">
    <div class="page-h"><h2 tabindex="-1">Did it hold your attention?</h2><p>A session is one sitting (a 30-minute gap starts a new one). This log never leaves your device.</p></div>
    <div class="big3 card"><div><b>${s.past3}<small>/${s.log.length}</small></b><span>sessions past 3 questions</span></div><div><b>${s.avg.toFixed(1)}</b><span>questions per session</span></div><div><b>${s.best}</b><span>best session</span></div></div>
    ${rows.length ? `<div class="card"><table class="log"><thead><tr><th>When</th><th>Answered</th><th>Got</th><th>Skipped</th><th>Min</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(fmtD(r.t0))}</td><td>${r.n}</td><td>${r.right}</td><td>${r.skip}</td><td>${Math.max(1, Math.round((r.t1 - r.t0) / 60000))}</td></tr>`).join("")}</tbody></table></div>
    <div class="row"><button class="btn" id="act-copy" type="button">Copy my activity</button></div><pre class="prompt-text" id="act-text" hidden>${esc(text)}</pre>` : `<p class="empty">Nothing yet. Answer a few questions and come back.</p>`}
  </main>`;
  const b = $("#act-copy"); if (b) b.onclick = () => { $("#act-text").hidden = false; copyText(text, $("#act-text")); };
}

/* ---------------- share / add tap options ---------------- */
function exportQuiz(q) { return JSON.stringify(q, null, 1); }
function sheet(title, bodyHTML, text, copyLabel) {
  const old = $("#sheet"); if (old) old.remove();
  const box = document.createElement("div"); box.className = "card sheet"; box.id = "sheet";
  box.innerHTML = `<b>${esc(title)}</b>${bodyHTML}<div class="row"><button class="btn primary" type="button" id="sheet-copy">${copyLabel}</button><button class="btn ghost" type="button" id="sheet-close">Close</button></div><pre class="prompt-text" id="sheet-text">${esc(text.length > 6000 ? text.slice(0, 6000) + "\n… (the Copy button copies all of it)" : text)}</pre>`;
  app().querySelector("main").prepend(box); window.scrollTo(0, 0);
  $("#sheet-copy").onclick = () => copyText(text, $("#sheet-text"));
  $("#sheet-close").onclick = () => box.remove();
}
function shareQuiz() { const { quiz } = current; sheet("Share “" + quiz.title + "”", `<p class="note">Send this quiz text to a friend. They open Kiron, tap <b>Import a quiz</b> and paste it. Your answers aren't included.</p>`, exportQuiz(quiz), "Copy quiz text"); }
function addTapPrompt(quiz) { return (window.SB_PROMPT_ADD || "") + "\n\n" + exportQuiz(quiz); }

/* ---------------- import ---------------- */
function renderImport() {
  current = null; document.title = "Import a quiz · Kiron";
  app().innerHTML = topBar(backBtn(), `<h1>Import a quiz</h1>`) + `<main class="wrap">
    <div class="page-h"><h2 tabindex="-1">Add a quiz</h2><p>Paste the quiz text an AI made for you (see <a href="#make">Make a quiz</a>), or one a friend sent you. You can also open a <b>.json</b> quiz file.</p></div>
    <textarea id="imp-text" class="mono" placeholder='Paste here. It starts with {"format": "study-buddy-quiz", …' aria-label="Quiz text"></textarea>
    <div class="row">
      <button class="btn primary" id="imp-go" type="button">Import</button>
      <label class="btn file-btn" for="imp-file">Open a file…<input type="file" id="imp-file" accept=".json,.txt,application/json,text/plain"></label>
    </div>
    <div id="imp-out" aria-live="polite"></div>
    <p class="note">The quiz is stored on this device only. To use it on another phone, share it from the quiz screen.</p>
  </main>`;
  $("#imp-go").onclick = () => doImport($("#imp-text").value);
  $("#imp-file").onchange = e => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    if (f.size > 3e6) { showImportErrors(["That file is too big to be a quiz (over 3 MB)."]); return; }
    const r = new FileReader(); r.onload = () => { $("#imp-text").value = r.result; doImport(r.result); }; r.readAsText(f);
  };
}
function showImportErrors(errs) {
  const shown = errs.slice(0, 12);
  const forAI = "The quiz JSON you gave me has these problems. Please fix them and send the complete corrected JSON in one code block:\n- " + errs.join("\n- ");
  $("#imp-out").innerHTML = `<div class="errors"><b>${errs.length === 1 ? "One thing to fix" : errs.length + " things to fix"}</b><ul>${shown.map(e => `<li>${esc(e)}</li>`).join("")}${errs.length > shown.length ? `<li>…and ${errs.length - shown.length} more.</li>` : ""}</ul>
    <span>Easiest fix: copy these problems back to the AI that made the quiz and ask it to correct them.</span>
    <div><button class="btn small" id="imp-copyerr" type="button">Copy problems for the AI</button></div></div>`;
  $("#imp-copyerr").onclick = () => copyText(forAI);
}
function doImport(raw) {
  const p = parseQuizText(raw);
  if (p.error) return showImportErrors([p.error]);
  const v = validateQuiz(p.data);
  if (v.errors) return showImportErrors(v.errors);
  const quiz = v.quiz;
  const clash = getImported().find(q => q.id === quiz.id) || SAMPLES.find(s => s.quiz.id === quiz.id);
  let n = 0, noTap = 0; eachQ(quiz, q => { n++; if (lacksTap(q)) noTap++; });
  $("#imp-out").innerHTML = `<div class="ok-box"><b>Looks good: “${esc(quiz.title)}”</b><span>${n} questions in ${quiz.sections.length} ${quiz.sections.length === 1 ? "part" : "parts"}.</span>
    ${noTap ? `<span><b>${noTap} ${noTap === 1 ? "question has" : "questions have"} no tap options</b>, so in Early revision ${noTap === 1 ? "it will show as a flip card" : "they will show as flip cards"}. You can save it as it is, or ask an AI to add them first.</span><div><button class="btn small" id="imp-addtap" type="button">Copy a prompt to add tap options</button></div>` : ""}
    ${clash ? `<span>You already have a quiz with this name.</span><div class="row"><button class="btn primary" id="imp-replace" type="button">Replace it</button><button class="btn" id="imp-both" type="button">Keep both</button></div>` : `<div class="row"><button class="btn primary" id="imp-save" type="button">Save and open</button></div>`}</div>`;
  const save = asNew => {
    let list = getImported();
    if (asNew) { let k = 2; while (allQuizzes().some(x => x.quiz.id === quiz.id + "-" + k)) k++; quiz.id = quiz.id + "-" + k; quiz.title = quiz.title + " (" + k + ")"; }
    list = list.filter(q => q.id !== quiz.id); list.unshift(quiz);
    if (!LS.set(K_IMPORTED, list)) { showImportErrors(["This device's storage is full or blocked (private browsing?), so the quiz couldn't be saved."]); return; }
    toast("Saved"); go("quiz-" + quiz.id);
  };
  if ($("#imp-save")) $("#imp-save").onclick = () => save(false);
  if ($("#imp-replace")) $("#imp-replace").onclick = () => save(false);
  if ($("#imp-both")) $("#imp-both").onclick = () => save(true);
  if ($("#imp-addtap")) $("#imp-addtap").onclick = () => copyText(addTapPrompt(quiz));
}

/* ---------------- make a quiz (prompt) ---------------- */
function renderMake() {
  current = null; document.title = "Make a quiz · Kiron";
  const prompt = window.SB_PROMPT || "";
  app().innerHTML = topBar(backBtn(), `<h1>Make a quiz</h1>`) + `<main class="wrap">
    <div class="page-h"><h2 tabindex="-1">Turn your notes into a quiz</h2><p>Kiron has no AI of its own. Any AI chat can write the quiz for you, and this prompt tells it exactly how. About two minutes.</p></div>
    <ol class="steps">
      <li><div><b>Copy the prompt</b><span>The button below copies it.</span></div></li>
      <li><div><b>Open ChatGPT, Claude or Gemini</b><span>The free version is fine. Paste the prompt and attach your PDF, slides or Word file.</span></div></li>
      <li><div><b>Answer its two questions</b><span>What you're reading it for, and how long a quiz you want.</span></div></li>
      <li><div><b>Copy the code block it gives back</b><span>All of it, from the first { to the last }.</span></div></li>
      <li><div><b>Import it here</b><span>Tap <b>Import a quiz</b> and paste. If something's off, Kiron tells you what to ask the AI to fix.</span></div></li>
    </ol>
    <div class="row"><button class="btn primary" id="mk-copy" type="button">Copy the prompt</button><button class="btn" data-go="import" type="button">Import a quiz</button></div>
    <details class="how"><summary>Read the prompt</summary><pre class="prompt-text" id="mk-text">${esc(prompt)}</pre></details>
    <p class="note">Each question comes in two forms, tap-to-answer and typed, so the quiz works in both revision modes. Big file? Upload a chapter at a time and make one quiz per part.</p>
  </main>`;
  $("#mk-copy").onclick = () => { document.querySelector("details.how").open = true; copyText(prompt, $("#mk-text")); };
}

/* ---------------- events ---------------- */
let armed = { el: null, t: 0 };
function twoTap(el, label) { if (armed.el === el && Date.now() - armed.t < 4000) { armed = { el: null, t: 0 }; return true; } armed = { el, t: Date.now() }; el.dataset.label = el.textContent; el.textContent = label; setTimeout(() => { if (el.isConnected && armed.el === el) { el.textContent = el.dataset.label; armed = { el: null, t: 0 }; } }, 4000); return false; }
document.addEventListener("click", e => {
  const t = e.target.closest("button, a, [data-go]"); if (!t) return;
  const d = t.dataset;
  if (d.setMode && DEEP_ON) { const first = !SET.mode; SET.mode = d.setMode; saveSet(); if (current) { current.mode = mode(); current.P = getProg(current.quiz.id); } route(); if (first) window.scrollTo(0, 0); else toast(MODES[SET.mode].name + " is on"); return; }
  if (d.setView) { SET.view = d.setView; saveSet(); route(); return; }
  if (d.go !== undefined) { go(d.go); return; }
  if (d.del) { if (!twoTap(t, "Tap again to delete")) return; LS.set(K_IMPORTED, getImported().filter(q => q.id !== d.del)); ["early", "deep"].forEach(m => LS.del(progKey2(d.del, m))); toast("Deleted"); go(""); return; }
  if (!current) return;
  if (d.pick !== undefined) return playAct("pick", t);
  if (d.toggle !== undefined) return playAct("toggle", t);
  if (d.mv !== undefined) return arrowMove(t);
  if (d.kp !== undefined) return playAct("kp", t);
  if (d.self) return playAct("self", t);
  if (d.part !== undefined) return startRound({ from: +d.part });
  const act = d.act; if (!act) return;
  if (act === "start") return startRound();
  if (act === "revisit") return startRound({ kind: "revisit" });
  if (act === "revisitround") { const { P } = current; const ids = P.round.ids.filter(x => P.round.res[x] === "miss" || P.round.res[x] === "partial"); ids.forEach(x => { delete P.a[x]; delete P.h[x]; P.n[x] = (P.n[x] || 0) + 1; }); P.round = { ids, i: 0, res: {}, kind: "revisit", streak: 0, ended: false }; P.cur = null; saveProg(); return renderPlay(); }
  if (act === "resume") return go("play-" + current.quiz.id);
  if (act === "share") return shareQuiz();
  if (act === "addtap") return sheet("Add tap options", `<p class="note">Paste this into any AI chat. It returns the same quiz with tap-to-answer options added. Import the result and choose <b>Replace it</b>.</p>`, addTapPrompt(current.quiz), "Copy prompt and quiz");
  if (act === "reset") { if (!twoTap(t, "Tap again to reset")) return; current.P = blankProg(); saveProg(); toast("Reset"); return renderHome(); }
  playAct(act, t);
});
document.addEventListener("input", e => { if (current && e.target.dataset && e.target.dataset.in && current.P.cur) { current.P.a[current.P.cur.id] = e.target.value; saveProg(); } });
document.addEventListener("keydown", e => {
  if (!current || !/^#play-/.test(location.hash) || e.metaKey || e.altKey) return;
  const tag = (e.target.tagName || "").toLowerCase(), typing = tag === "textarea" || (tag === "input" && e.target.type === "text");
  const click = sel => { const b = app().querySelector(sel); if (b && !b.disabled) { e.preventDefault(); b.click(); return true; } return false; };
  if (e.key === "Enter") {
    if (tag === "textarea" && !e.ctrlKey) return;
    if (tag === "button" || tag === "a" || tag === "summary") return;
    click('[data-act="next"]') || click('[data-act="check"]') || click('[data-act="flip"]') || click('.endcard .btn.primary'); return;
  }
  if (typing || e.ctrlKey) return;
  if (e.key === "ArrowLeft") { e.preventDefault(); return nav(-1); }
  if (e.key === "ArrowRight") { e.preventDefault(); return nav(1); }
  if (/^[1-9]$/.test(e.key)) { const opts = app().querySelectorAll(".opts .opt"); const b = opts[+e.key - 1]; if (b && !b.disabled) { e.preventDefault(); b.click(); } return; }
  const k = e.key.toLowerCase();
  if (k === "h") click('[data-act="hint"]');
});

/* ---------------- boot ---------------- */
window.SB = { validateQuiz, parseQuizText, formOf, buildRound, logSummary, nav };
applyView();
route();
loadSamples().then(route);
if ("serviceWorker" in navigator && location.protocol === "https:") {
  try { navigator.serviceWorker.register("sw.js").catch(() => {}); } catch (e) {}
}
})();
