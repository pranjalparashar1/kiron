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
/* Maths typesetting over the quiz text (no per-question editing): x^2 -> superscript, z_m -> subscript, a/b and a ÷ b -> stacked fraction, proper − and ×. */
const SUPM = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "⁻": "−", "⁺": "+", "ⁿ": "n" };
const SUBM = { "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4", "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9", "₋": "−", "₊": "+", "ₙ": "n", "ₜ": "t", "ₘ": "m", "ₓ": "x", "ₐ": "a", "ₑ": "e", "ₒ": "o", "ᵢ": "i", "ⱼ": "j", "ₖ": "k", "ₗ": "l", "ₛ": "s", "ₚ": "p", "ₕ": "h" };
const FTERM = "(?:\\([^()]+\\)|\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?%?|[A-Za-z0-9]+(?:\\.\\d+)*%?)(?:<su[bp]>[^<]*<\\/su[bp]>)*";
// Lookbehind (?<!...) is not supported before iOS 16.4: if it throws, skip fraction/minus typesetting instead of showing a blank app.
let FRAC_RE = null, LB = true;
try { FRAC_RE = new RegExp("(?<![\\w.)\\]])(" + FTERM + ")\\s*[\\/÷]\\s*(" + FTERM + ")(?![\\w\\[(,]|\\.\\d|<su)", "g"); new RegExp("(?<=[\\d)])x"); } catch (e) { LB = false; FRAC_RE = null; }
function mathify(h) {
  const supm = c => SUPM[c] || c, subm = c => SUBM[c] || c;
  h = h.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺ⁿ]+/g, m => "<sup>" + [...m].map(supm).join("") + "</sup>")
       .replace(/[₀₁₂₃₄₅₆₇₈₉₋₊ₙₜₘₓₐₑₒᵢⱼₖₗₛₚₕ]+/g, m => "<sub>" + [...m].map(subm).join("") + "</sub>")
       .replace(/\^\(([^)]*)\)/g, (_, a) => "<sup>" + a.replace(/-/g, "−") + "</sup>")
       .replace(/\^(-?\d+(?:\.\d+)?|[A-Za-z]\w*)/g, (_, a) => "<sup>" + a.replace(/-/g, "−") + "</sup>")
       .replace(/_\(([^)]*)\)/g, "<sub>$1</sub>")
       .replace(/_([A-Za-z0-9]+)/g, "<sub>$1</sub>")
       .replace(/(^|[\s(=×÷+<>\/])-(?=\.?\d)/g, "$1−");
  if (LB) h = h.replace(new RegExp("(?<=[\\d)])\\s[x*]\\s(?=[\\d(])", "g"), " × ").replace(new RegExp("(?<=[\\d)>%])\\s-\\s(?=[\\d(.])", "g"), " − ");
  if (!FRAC_RE) return h;
  const strip = t => { const m = t.match(/^\(([^()]*)\)$/); return m ? m[1] : t; };
  for (let k = 0; k < 3; k++) {
    const before = h;
    h = h.replace(FRAC_RE, (all, a, b) => {
      const pa = a.replace(/<[^>]*>/g, ""), pb = b.replace(/<[^>]*>/g, "");
      const word = x => /^[A-Za-z]{3,}$/.test(x) && x !== x.toUpperCase() && !/^[A-Z]{2,}[a-z]$/.test(x);
      const digits = /\d/.test(pa + pb), shortVars = pa.length <= 4 && pb.length <= 4 && !(pa === pa.toUpperCase() && pb === pb.toUpperCase());
      if (word(pa) || word(pb) || (!digits && !shortVars)) return all;
      return `<span class="frac"><span>${strip(a)}</span><span>${strip(b)}</span></span>`;
    });
    if (h === before) break;
  }
  return h;
}
const fmt = s => mathify(esc(s)).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<i>$2</i>").replace(/\n/g, "<br>");
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
  return imp.concat(SAMPLES.filter(s => !ids.has(s.quiz.id)).map(s => ({ quiz: s.quiz, mine: false })))
    .sort((a, b) => a.quiz.title.localeCompare(b.quiz.title, undefined, { sensitivity: "base", numeric: true }));
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
// Phone-only now: one layout everywhere (it still runs on a laptop, just at phone width).
function applyView() { document.documentElement.dataset.view = "phone"; }

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
let current = null; // { quiz, mine, P, mode }
const app = () => $("#app");
function openQuiz(id) {
  const found = findQuiz(id); if (!found) return null;
  current = { quiz: found.quiz, mine: found.mine, mode: mode(), P: getProg(found.quiz.id) };
  return current;
}
function route() {
  clearTimer();
  if (!/^#play-/.test(location.hash)) {
    ["#streak", ".goo", ".fly", ".rowlabel"].forEach(s => document.querySelectorAll(s).forEach(p => p.remove()));
    // Leaving the quiz ends the streak.
    if (current && current.P.round && current.P.round.streak) { current.P.round.streak = 0; saveProg(); }
  }
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
// rep = replace the history entry instead of adding one, so Back from a round goes to the library, not round -> home -> round -> home.
function go(h, rep) { if (location.hash === "#" + h || (!h && !location.hash)) { route(); window.scrollTo(0, 0); } else if (rep) location.replace(location.pathname + location.search + "#" + h); else location.hash = h; }
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
const viewBtn = () => "";
function renderLibrary() {
  current = null; document.title = "Kiron";
  const list = allQuizzes();
  app().innerHTML = topBar("", `<div class="brand"><img src="icon-192.png" alt="">Kiron</div>`, viewBtn()) + `
  <main class="wrap lib">
    <h1 class="pick">Pick your quiz</h1>
    <div class="grid">${list.length ? list.map(x => `<button class="card qcard" data-go="quiz-${esc(x.quiz.id)}" type="button"><h3>${esc(x.quiz.title)}</h3><span class="chev" aria-hidden="true">›</span></button>`).join("") : `<p class="empty">${samplesLoaded ? "No quizzes yet." : "Loading…"}</p>`}</div>
    <p class="credit">Made by Pranjal Parashar</p>
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
  const stateOf = pc => !pc.total || pc.left === pc.total ? ["none", "Not started"] : pc.left === 0 && pc.skip === 0 ? ["done", "Done"] : ["some", "In progress"];
  const parts = quiz.sections.map((s, i) => {
    const pc = counts(quiz, P, i), st = stateOf(pc), answered = pc.right + pc.revisit > 0;
    const acts = st[0] === "none" ? `<button class="btn primary" data-act="partstart" data-pi="${i}" type="button">Start</button>`
      : `${st[0] === "some" ? `<button class="btn primary" data-act="partstart" data-pi="${i}" type="button">Continue</button>` : ""}${answered ? `<button class="btn" data-act="partreview" data-pi="${i}" type="button">Review</button>` : ""}<button class="btn ghost" data-act="partredo" data-pi="${i}" type="button">Redo</button>`;
    return `<div class="part"><button class="part-row" type="button" data-act="partopen" aria-expanded="false"><span class="pdot s-${st[0]}" aria-hidden="true"></span><b>${esc(s.title)}</b><span class="pstate s-${st[0]}">${st[1]}</span></button><div class="unfurl" inert><div class="unfurl-in"><div class="pact">${acts}</div></div></div></div>`;
  }).join("");
  app().innerHTML = topBar(backBtn(), `<span class="grow"></span>`, viewBtn()) + `
  <main class="wrap home">
    <h1 class="qtitle">${esc(quiz.title)}</h1>
    <div class="cta">${primary}${c.revisit && (inRound || c.left || c.skip) ? `<button class="btn" data-act="revisit" type="button">Revisit what you missed</button>` : ""}</div>
    ${quiz.sections.length > 1 ? `<div class="jump"><button class="jump-btn" type="button" data-act="jump" aria-expanded="false">Jump to a part<span class="car" aria-hidden="true">▾</span></button><div class="unfurl" inert><div class="unfurl-in"><div class="parts">${parts}</div></div></div></div>` : ""}
    <div class="foot">${started || inRound ? `<button class="btn ghost danger" data-act="reset" type="button">Reset quiz</button>` : ""}${mine ? `<button class="btn ghost danger" data-del="${esc(quiz.id)}" type="button">Delete this quiz</button>` : ""}</div>
  </main>`;
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
  if (!(f.kind in { pick: 1, flip: 1, multi: 1, order: 1 })) return 0;
  if (TIME.fixed) return TIME.fixed;
  const parts = [f.prompt || "", ...(f.options || q.options || q.items || [])].join(" ").replace(/<[^>]*>/g, " ");
  const words = (parts.match(/\S+/g) || []).length;
  const ms = Math.min(TIME.max, Math.max(TIME.min, TIME.base + words * TIME.perWord));
  return Math.round(ms * (TIME.mult[f.kind] || 1));
}
let TIMER = null;   // { id, dur, t0, pausedAt, to }
// The timer always plays by default. Pause holds only the question you are on; the next question starts playing again.
let PAUSED = false;
if ("paused" in SET) { delete SET.paused; saveSet(); }
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
const buzz = ms => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} };
function renderPlay(keepScroll) {
  const { quiz, P } = current;
  const r = P.round;
  if (!r) return go("quiz-" + quiz.id, true);
  document.title = quiz.title + " · Kiron";
  if (r.ended || r.i >= r.ids.length) return renderRoundEnd();
  const y0 = window.scrollY;
  const { q, id } = getQ(quiz, r.ids[r.i]);
  if (!P.cur || P.cur.id !== id) {
    const was = r.res[id];
    P.cur = was && was !== "skip" ? { id, done: true, status: was, revealed: true, ticks: [] } : { id, done: false };
  }
  const cur = P.cur, f = formOf(q, current.mode);
  const fx = FX && FX.id === id ? FX : null; FX = null;
  // Pause keeps the timer where it is: the bar freezes and Play carries on from the same spot.
  const timedDur = !cur.done && !r.review && !cur.revealed ? durFor(q, f) : 0;
  if (timedDur) { if (!TIMER || TIMER.id !== id) { clearTimer(); const now = Date.now(); PAUSED = false; TIMER = { id, dur: timedDur, t0: now, pausedAt: 0, to: null }; } } else clearTimer();
  const dots = r.ids.map((x, i) => `<i class="${i < r.i ? (r.res[x] === "skip" ? "skip" : "past") : i === r.i ? "now" + (cur.done ? " full" : timedDur ? " timing" : "") : ""}"${i === r.i && timedDur ? ` style="--dur:${timedDur}ms;--delay:-${Math.min(timerElapsed(), timedDur)}ms"` : ""}></i>`).join("");
  const status = cur.done ? cur.status : null;
  let input = "", primary = "";
  const a = P.a[id];
  if (f.kind === "pick") {
    const ord = /\b(all|none|both) of|\babove\b|\bboth [a-d]\b/i.test(f.options.join(" ")) ? f.options.map((_, i) => i) : shuffledOrder(id + ":" + (P.n[id] || 0), f.options.length);
    input = `<div class="opts" role="group" aria-label="Options">` + ord.map((oi, pos) => {
      let cls = "opt", ic = "";
      if (cur.done) { if (oi === f.correct) { cls += " ok"; ic = "✓"; } else if (a === oi) { cls += " wrong"; ic = "✕"; } else cls += " dim"; }
      if (fx && fx.oi === oi) cls += fx.kind === "right" ? " pop" : " shake";
      return `<button type="button" class="${cls}" data-pick="${oi}"${cur.done ? ' aria-disabled="true" tabindex="-1"' : ""}><span class="k${ic ? " ic" : ""}">${ic || pos + 1}</span><span>${fmt(f.options[oi])}</span></button>`;
    }).join("") + `</div>`;
  } else if (f.kind === "multi") {
    const sel = a || [];
    input = `<p class="lead">Pick all that apply.</p><div class="opts" role="group" aria-label="Options">` + q.options.map((o, i) => {
      let cls = "opt" + (sel.includes(i) ? " sel" : ""), ic = sel.includes(i) ? "✓" : "";
      // Once checked, only the right options stay bright; everything else fades back. No tick boxes then.
      if (cur.done) { const right = q.correct.includes(i), ch = sel.includes(i); cls = "opt" + (ch && right ? " ok" : ch ? " wrong dim" : right ? " missed" : " dim"); }
      return `<button type="button" class="${cls}" data-toggle="${i}" aria-pressed="${sel.includes(i)}"${cur.done ? ' aria-disabled="true" tabindex="-1"' : ""}>${cur.done ? "" : `<span class="k box">${ic}</span>`}<span>${fmt(o)}</span></button>`;
    }).join("") + `</div>`;
    primary = "check";
  } else if (f.kind === "order") {
    const ord = a || orderStart(id, q.items.length);
    input = `<p class="lead">${cur.done ? "Your order:" : "Drag, or tap the arrows."}</p><ol class="order${cur.done ? " done" : ""}">` + ord.map((it, pos) => {
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
  const hintBtn = q.hint && !P.h[id] && !cur.done && !r.review ? `<button class="btn ghost${primary ? "" : " grow"}" data-act="hint" type="button">💡 Hint</button>` : "";
  const nudge = status && status !== "right" ? " pulse" : "";
  const bar = cur.done
    ? `${back}<button class="btn primary grow${nudge}" data-act="next" type="button">${r.i + 1 >= r.ids.length ? (r.review ? "Done" : "Finish") : "Next"}</button>`
    : `${back}${hintBtn}${primary === "check" ? `<button class="btn primary grow" data-act="check" type="button">Check</button>` : primary === "flip" ? `<button class="btn primary grow" data-act="flip" type="button">Show answer</button>` : needsSelf ? `<span class="grow note">Mark yourself to continue</span>` : ""}`;
  const long = f.prompt.length > 150 ? " long" : "";
  const isNum = q.type === "number", nid = r.ids[r.i + 1], nextNum = nid && getQ(quiz, nid).q.type === "number" && !r.review;
  // Streak: the bar takes on the streak's colour. On a fresh right answer from 3 in a row, the bar first shows the old level, then the counter flies in and lifts it.
  const stk = r.review ? 0 : r.streak || 0, feeding = fx && fx.kind === "right" && stk >= 3, heatNow = heatLevel(feeding ? stk - 1 : stk);
  app().innerHTML = `<header class="top play"><div class="top-in"><button class="icon-btn" data-go="quiz-${esc(quiz.id)}" data-replace="1" aria-label="Leave this round" type="button">✕</button><div class="dots${PAUSED ? " halted" : ""}" data-heat="${heatNow}" role="img" aria-label="Question ${r.i + 1} of ${r.ids.length}${stk >= 3 ? ", " + stk + " in a row" : ""}">${dots}</div>${r.review ? "" : `<span class="heat${heatNow ? " on" : ""}" data-heat="${heatNow}" aria-hidden="true"><span class="fl">${heatIcon(heatNow)}</span><b class="n">${feeding ? stk - 1 : stk}</b></span>`}${r.review ? "" : `<button class="icon-btn pause${PAUSED ? " on" : ""}" data-act="pause" type="button" aria-pressed="${!!PAUSED}" aria-label="${PAUSED ? "Resume timer" : "Pause timer"}">${PAUSED ? `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5l11 7-11 7z"/></svg>` : `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>`}</button>`}</div>${nextNum ? `<div class="headsup">Numbers next. You only pick the setup. No calculating.</div>` : ""}</header>
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
  DIR = 0;
  if (!r.review) placeSky(heatNow);
  armTimer(); if (TIMER && TIMER.pausedAt) { const dd = document.querySelector(".dots"); if (dd) dd.classList.add("paused"); }
  if (!keepScroll) window.scrollTo(0, 0);
  else {
    window.scrollTo(0, y0);
    const el = app().querySelector(".fb");
    if (keepScroll === "fb" && el) {
      const wrong = status && status !== "right";
      // let the shake play first on a wrong answer, then peek the explanation in (never pushing the question off the top)
      setTimeout(() => reveal(el), wrong && !reduceMotion() ? 480 : 60);
    }
  }
  if (fx && fx.kind === "right") { const ok = app().querySelector(".opt.ok"); if (ok) burst(ok); }
  if (feeding) streakFeed(stk);
}
/* Gentle auto-scroll: bring the first `peek` px of el above the action bar, but never scroll the question
   off the top of the screen. If there is still more below, the reader scrolls by hand. */
function reveal(el, peek) {
  if (!el || !el.isConnected) return;
  const hdr = $(".top.play"), bar = $(".actionbar"), p = $("#qprompt");
  const topY = (hdr ? hdr.getBoundingClientRect().bottom : 0) + 10, botY = (bar ? bar.getBoundingClientRect().top : innerHeight) - 14;
  const b = el.getBoundingClientRect(), want = Math.min(b.bottom, b.top + (peek || 110)) - botY;
  if (want <= 0) return;
  const room = p ? Math.max(0, p.getBoundingClientRect().top - topY) : want;
  const by = Math.min(want, room); if (by < 4) return;
  window.scrollBy({ top: by, behavior: reduceMotion() ? "auto" : "smooth" });
}
function burst(el) {
  if (reduceMotion()) return;
  const b = el.getBoundingClientRect(), cols = ["#d97757", "#faf9f5", "#6a9bcc", "#788c5d", "#e3b04b"];
  for (let i = 0; i < 16; i++) {
    const p = document.createElement("i"); p.className = "conf";
    const ang = (Math.PI * 2 * i) / 16 + Math.random() * .4, d = 50 + Math.random() * 70;
    p.style.cssText = `left:${b.right - 28}px;top:${b.top + b.height / 2}px;background:${cols[i % cols.length]};--dx:${Math.cos(ang) * d}px;--dy:${Math.sin(ang) * d - 20}px`;
    document.body.append(p); setTimeout(() => p.remove(), 800);
  }
}
/* Streak: from 3 in a row, each right answer drips a bubble out of the middle of the timer bar. It swells into
   "N in a row" at the top centre of the screen, then rolls up and melts into the end of the bar (liquid merge).
   The bar, the flame and the count beside it take the streak's colour. The timer keeps running throughout.
   Fire:      3 amber · 5 gold · 8 pale gold · 11 white-hot · 15 black fire
   Celestial: 20 nebula (violet, magenta and teal clouds drift behind the bar)
              25 constellation (stars appear around the bar and join up with fine lines)
              30 galaxy (clouds, constellation and a ringed star; the bar shimmers gold-white)
   A wrong answer, or leaving the quiz, cools it back. */
const BLACK_FIRE = 15, STAGES = [3, 5, 8, 11, BLACK_FIRE, 20, 25, 30];
const heatLevel = n => { let l = 0; STAGES.forEach((t, i) => { if (n >= t) l = i + 1; }); return l; };
const HEAT_COL = ["#faf9f5", "#f0b23a", "#ffcf3f", "#ffe9a3", "#ffffff", "#0b0b0b", "#9b7bff", "#dfe7ff", "#fff1c9"];
const PILL_BG = ["#faf9f5", "#f0b23a", "#ffcf3f", "#ffe9a3", "#ffffff", "#0b0b0b", "linear-gradient(100deg,#7c5cff,#c86bd1 55%,#4fb6c9)", "#dfe7ff", "linear-gradient(100deg,#fff1c9,#ffffff 45%,#c9b8ff)"];
// The flame: two shapes, an outer tongue and a hot core, that flicker out of step. From 25 it becomes a star; at 30 a ringed star.
function heatIcon(l) {
  if (l >= 6) gooDefs();
  if (l >= 7) return `<svg class="kstar${l >= 8 ? " ringed" : ""}" viewBox="-14 -14 28 28" aria-hidden="true">${l >= 8 ? `<ellipse class="ring" rx="12.5" ry="4.2" transform="rotate(-22)"/>` : ""}<path class="s" d="M0-11C1.1-3.2 3.2-1.1 11 0C3.2 1.1 1.1 3.2 0 11C-1.1 3.2-3.2 1.1-11 0C-3.2-1.1-1.1-3.2 0-11Z"/><circle class="core" r="1.8"/>${l >= 8 ? `<g transform="rotate(-22) scale(1 .336)"><g class="moon"><circle cx="12.5" r="4.4"/></g></g>` : ""}</svg>`;
  return `<svg class="kf" viewBox="0 0 24 32" aria-hidden="true"><path class="o" d="M12 1.5c1.2 6.2 7.5 9.6 7.5 18a7.5 7.5 0 0 1-15 0c0-4.1 2-6.9 3.7-8.4.3 2.5 1.4 3.8 2.8 4.3C10.4 10.6 10.8 5.7 12 1.5z"/><path class="c" d="M12.2 14.5c.7 3 4.1 4.7 4.1 8.4a4.3 4.3 0 0 1-8.6 0c0-2.1 1-3.4 2.1-4.2.2 1.1.8 1.7 1.4 1.9-.2-2.4.2-4.3 1-6.1z"/></svg>`;
}
function gooDefs() {
  if ($("#kgoo-svg")) return;
  const NS = "http://www.w3.org/2000/svg", svg = document.createElementNS(NS, "svg");
  svg.id = "kgoo-svg"; svg.setAttribute("width", "0"); svg.setAttribute("height", "0"); svg.setAttribute("aria-hidden", "true"); svg.style.position = "absolute";
  svg.innerHTML = `<defs><filter id="kgoo" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur in="SourceGraphic" stdDeviation="6" result="b"/><feColorMatrix in="b" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -9"/></filter>
    <linearGradient id="kneb" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#4fb6c9"/><stop offset=".5" stop-color="#c86bd1"/><stop offset="1" stop-color="#7c5cff"/></linearGradient>
    <linearGradient id="kgold" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#c9b8ff"/><stop offset=".5" stop-color="#ffffff"/><stop offset="1" stop-color="#ffe3a0"/></linearGradient></defs>`;
  document.body.append(svg);
}
// a tiny seeded random, so the sky looks the same on every screen of a run instead of jumping around
const seeded = seed => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
// The celestial sky lives behind the timer bar, inside the top bar only (never over the question).
function placeSky(lvl, fresh) {
  const top = $(".top.play .top-in"), dots = $(".dots"); if (!top || !dots) return;
  let sky = top.querySelector(".sky");
  if (lvl < 6) { if (sky) sky.remove(); return; }
  gooDefs();
  const t = top.getBoundingClientRect(), d = dots.getBoundingClientRect(), W = Math.round(d.width + 16), H = 40;
  if (!sky) { sky = document.createElement("span"); sky.className = "sky"; sky.setAttribute("aria-hidden", "true"); top.prepend(sky); }
  sky.dataset.heat = lvl; sky.classList.toggle("fresh", !!fresh);
  sky.style.cssText = `left:${d.left - t.left - 8}px;top:${d.top - t.top + d.height / 2 - H / 2}px;width:${W}px;height:${H}px`;
  const rnd = seeded(7 + lvl), still = reduceMotion();
  let h = "";
  if (lvl !== 7) h += `<b class="neb n1"></b><b class="neb n2"></b><b class="neb n3"></b>`;
  if (lvl >= 7) {
    const n = Math.max(5, Math.min(9, Math.round(W / 34))), pts = [];
    for (let i = 0; i < n; i++) { const up = i % 2 ? -1 : 1; pts.push([Math.round(8 + (W - 16) * (i + .15 + rnd() * .7) / n), Math.round(H / 2 + up * (7 + rnd() * 9))]); }
    const line = pts.map(p => p.join(",")).join(" "), len = Math.round(pts.reduce((a, p, i) => i ? a + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0, 0));
    h += `<svg class="cons" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><polyline points="${line}" style="--len:${len}"/>${pts.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="${i % 3 ? 1.3 : 1.9}" style="--i:${i}"/>`).join("")}</svg>`;
  }
  const np = lvl >= 8 ? 16 : 10;
  for (let i = 0; i < np; i++) h += `<i style="left:${(rnd() * 100).toFixed(1)}%;top:${(10 + rnd() * 80).toFixed(1)}%;--s:${(1 + rnd() * 1.6).toFixed(1)}px;--d:${(4 + rnd() * 5).toFixed(1)}s;--l:-${(rnd() * 8).toFixed(1)}s;--x:${Math.round(rnd() * 24 - 12)}px"></i>`;
  sky.innerHTML = h;
  if (still) sky.classList.add("still");
}
addEventListener("resize", () => { const s = $(".sky"), d = $(".dots"); if (s && d) placeSky(+d.dataset.heat || 0); });
function streakFeed(n) {
  ["#streak", ".goo", ".fly", ".rowlabel"].forEach(s => document.querySelectorAll(s).forEach(o => o.remove()));
  const dots = $(".dots"), slot = $(".heat"); if (!dots || !slot) return;
  const lvl = heatLevel(n), was = heatLevel(n - 1), up = lvl !== was;
  const lift = () => {
    if (!dots.isConnected) return;
    dots.dataset.heat = lvl; slot.dataset.heat = lvl; slot.classList.add("on");
    const num = slot.querySelector(".n"); if (num) num.textContent = n;
    const fl = slot.querySelector(".fl"); if (fl && up) fl.innerHTML = heatIcon(lvl);
    placeSky(lvl, up);
    flash(dots, "fed"); flash(slot, "fed");
  };
  // "N in a row" at the top centre, below the bar
  const label = document.createElement("span"); label.className = "rowlabel" + (up ? " up" : ""); label.dataset.heat = lvl; label.setAttribute("aria-hidden", "true");
  label.innerHTML = `<span class="fl">${heatIcon(lvl)}</span>${n} in a row`;
  const t = dots.getBoundingClientRect(), s = slot.getBoundingClientRect(), hdr = ($(".top.play") || dots).getBoundingClientRect();
  const px = innerWidth / 2, py = hdr.bottom + 46;
  label.style.left = px + "px"; label.style.top = py + "px"; document.body.append(label);
  if (reduceMotion() || !document.body.animate) {
    lift(); label.classList.add("calm"); setTimeout(() => label.remove(), 1500); return;
  }
  gooDefs();
  const W = Math.max(label.offsetWidth + 8, 120), H = label.offsetHeight || 42;
  const bx = t.left + t.width / 2, by = t.top + t.height / 2;
  const tx = s.width > 4 ? s.left + 10 : t.right - 4, ty = t.top + t.height / 2;
  const bg = PILL_BG[lvl], k = H / W, e = "cubic-bezier(.45,0,.4,1)";
  const goo = document.createElement("div"); goo.className = "goo";
  const pill = document.createElement("i"), neck = document.createElement("i"), well = document.createElement("i");
  pill.style.cssText = `width:${W}px;height:${H}px;left:${px - W / 2}px;top:${py - H / 2}px;background:${bg}`;
  neck.style.cssText = `width:18px;height:18px;left:${bx - 9}px;top:${by - 9}px;background:${bg}`;
  well.style.cssText = `width:22px;height:14px;left:${tx - 11}px;top:${ty - 7}px;background:${bg}`;
  goo.append(neck, well, pill); document.body.append(goo);
  const dur = 2100, fromBar = `translate(${bx - px}px, ${by - py}px)`, dx = tx - px, dy = ty - py;
  pill.animate([
    { offset: 0, easing: e,    opacity: 0, transform: `${fromBar} scale(${k * .25}, .25)` },
    { offset: .05, easing: e,  opacity: 1, transform: `${fromBar} scale(${k * .45}, .45)` },
    { offset: .15, easing: e,  opacity: 1, transform: `translate(0, -10px) scale(${k * .8}, .95)` },
    { offset: .23, easing: e,  opacity: 1, transform: `translate(0, 3px) scale(1.06, .9)` },
    { offset: .3, easing: e,   opacity: 1, transform: `translate(0, 0) scale(.98, 1.03)` },
    { offset: .36, easing: e,  opacity: 1, transform: `translate(0, 0) scale(1)` },
    { offset: .6, easing: e,   opacity: 1, transform: `translate(0, 0) scale(1)` },
    { offset: .68, easing: e,  opacity: 1, transform: `translate(0, 4px) scale(${k * 1.05}, .95)` },
    { offset: .78, easing: e,  opacity: 1, transform: `translate(${dx * .55}px, ${dy * .45}px) scale(${k * .7}, .8)` },
    { offset: .87, easing: e,  opacity: 1, transform: `translate(${dx}px, ${dy}px) scale(${k * .55}, .45)` },
    { offset: 1,               opacity: 0, transform: `translate(${dx}px, ${dy}px) scale(${k * .15}, .12)` }
  ], { duration: dur, easing: "linear", fill: "forwards" });
  neck.animate([
    { offset: 0, easing: e,   opacity: 0, transform: "scale(0)" },
    { offset: .04, easing: e, opacity: 1, transform: "scale(1.5, .8)" },
    { offset: .1, easing: e,  opacity: 1, transform: "translateY(10px) scale(.7, 1.6)" },
    { offset: .18,            opacity: 0, transform: "translateY(16px) scale(0)" },
    { offset: 1,              opacity: 0, transform: "scale(0)" }
  ], { duration: dur, easing: "linear", fill: "forwards" });
  well.animate([
    { offset: 0,              opacity: 0, transform: "scale(0)" },
    { offset: .74, easing: e, opacity: 0, transform: "scale(0)" },
    { offset: .82, easing: e, opacity: 1, transform: "translateY(5px) scale(.9, 1.9)" },
    { offset: .9, easing: e,  opacity: 1, transform: "scale(1.9, 1.1)" },
    { offset: .96, easing: e, opacity: .8, transform: "scale(1.3, .7)" },
    { offset: 1,              opacity: 0, transform: "scale(.6, .4)" }
  ], { duration: dur, easing: "linear", fill: "forwards" });
  label.animate([
    { offset: 0,              opacity: 0, transform: "translate(-50%, -50%) scale(.7)" },
    { offset: .18, easing: e, opacity: 0, transform: "translate(-50%, -50%) scale(.7)" },
    { offset: .28, easing: e, opacity: 1, transform: "translate(-50%, -50%) scale(1.04)" },
    { offset: .34, easing: e, opacity: 1, transform: "translate(-50%, -50%) scale(1)" },
    { offset: .58, easing: e, opacity: 1, transform: "translate(-50%, -50%) scale(1)" },
    { offset: .66,            opacity: 0, transform: "translate(-50%, -50%) scale(.6)" },
    { offset: 1,              opacity: 0, transform: "translate(-50%, -50%) scale(.6)" }
  ], { duration: dur, easing: "linear", fill: "forwards" });
  setTimeout(lift, dur * .88);
  setTimeout(() => { goo.remove(); label.remove(); }, dur + 60);
}
function finalize(status) {
  const { quiz, P } = current, r = P.round, id = P.cur.id;
  const first = !P.cur.done;
  P.cur.done = true; P.cur.status = status;
  P.st[id] = status; r.res[id] = status;
  if (first) {
    r.streak = status === "right" ? (r.streak || 0) + 1 : 0; r.best = Math.max(r.best || 0, r.streak); logEvent(status === "right" ? "right" : "other", quiz.id);
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
  if (!r.review && (!P.cur || !P.cur.done)) { if (!P.st[id]) P.st[id] = "skip"; r.res[id] = "skip"; logEvent("skip", quiz.id); }
  if (r.review && r.i + 1 >= r.ids.length) { P.round = null; P.cur = null; saveProg(); return go("quiz-" + quiz.id, true); }
  r.i++; P.cur = null; DIR = 1; if (r.i >= r.ids.length) { r.ended = true; }
  saveProg(); renderPlay(); const h = $("#qprompt") || $("#endh"); if (h) h.focus({ preventScroll: true });
}
function playAct(act, el) {
  const { quiz, P } = current, r = P.round; if (!r) return;
  if (r.ended || r.i >= r.ids.length) return;
  const cur = P.cur, { q, id } = getQ(quiz, r.ids[r.i]), f = formOf(q, current.mode);
  if (act === "pick") { if (cur.done) return; const oi = +el.dataset.pick; P.a[id] = oi; const ok = oi === f.correct; finalize(ok ? "right" : "miss"); FX = { id, kind: ok ? "right" : "wrong", oi }; buzz(ok ? 12 : [30, 40, 30]); return renderPlay("fb"); }
  if (act === "toggle") { if (cur.done) return; const i = +el.dataset.toggle, s = new Set(P.a[id] || []); s.has(i) ? s.delete(i) : s.add(i); P.a[id] = [...s].sort((x, y) => x - y); saveProg(); renderPlay(true); const b = app().querySelector(`[data-toggle="${i}"]`); if (b) b.focus(); return; }
  if (act === "hint") { P.h[id] = true; saveProg(); renderPlay(true); const h = app().querySelector(".hint"); if (h) h.classList.add("fresh"); if (h) reveal(h, 400); return; }
  if (act === "pause") { PAUSED = !PAUSED; if (TIMER) { clearTimeout(TIMER.to); if (PAUSED) { if (!TIMER.pausedAt) TIMER.pausedAt = Date.now(); } else if (TIMER.pausedAt && !document.hidden) { TIMER.t0 += Date.now() - TIMER.pausedAt; TIMER.pausedAt = 0; } } return renderPlay(true); }
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
// lift = the row the person moved with an arrow: it rises a little, glides to its new place and settles, so the swap is easy to follow.
function moveLi(ol, li, to, lift) {
  const kids = [...ol.children], from = kids.indexOf(li);
  if (to < 0 || to >= kids.length || to === from) return false;
  const before = new Map(kids.map(k => [k, k.getBoundingClientRect().top]));
  ol.insertBefore(li, to > from ? kids[to].nextSibling : kids[to]);
  if (!reduceMotion()) kids.forEach(k => {
    if (k === dragging) return; const d = before.get(k) - k.getBoundingClientRect().top; if (!d) return;
    if (k === lift) { k.classList.add("lift"); const a = k.animate([{ transform: `translateY(${d}px) scale(1)` }, { transform: `translateY(${d * .55}px) scale(1.045)`, offset: .35 }, { transform: "translateY(0) scale(1.045)", offset: .8 }, { transform: "none" }], { duration: 520, easing: "cubic-bezier(.3,.7,.2,1)" }); a.onfinish = a.oncancel = () => k.classList.remove("lift"); }
    else k.animate([{ transform: `translateY(${d}px)` }, { transform: "none" }], { duration: lift ? 520 : 240, easing: "cubic-bezier(.3,.7,.2,1)" });
  });
  return true;
}
function flash(li, cls) { cls = cls || "moved"; li.classList.remove(cls); void li.offsetWidth; li.classList.add(cls); }
function arrowMove(btn) {
  const li = btn.closest("li"), ol = li.parentElement, dir = +btn.dataset.mv, i = [...ol.children].indexOf(li), other = ol.children[i + dir];
  if (!moveLi(ol, li, i + dir, li)) return;
  syncOrder(ol, true); flash(li); if (other) flash(other, "nudged"); buzz(8);
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

/* ---- story-style edge taps: left quarter = back, right quarter = next (or "do this later" if unanswered). No swipes, no centre taps. ---- */
const EDGE = 0.25; // width of each tap zone, as a share of the screen
let tapDown = null, ghostUntil = 0;
document.addEventListener("pointerdown", e => { tapDown = { x: e.clientX, y: e.clientY, t: Date.now() }; }, true);
document.addEventListener("pointerup", e => {
  const d = tapDown; tapDown = null;
  if (!d || !current || !/^#play-/.test(location.hash) || !current.P.round || current.P.round.ended) return;
  const t = e.target && e.target.closest ? e.target : null; if (!t) return;
  if (t.closest("a, input, textarea, label, summary, .actionbar, .top, .toast, .kp, .selfmark, .grip, .mv, [data-act], [data-self], [data-kp], [data-go]")) return;
  // Answer options, the ordering list and the hint never navigate, answered or not.
  if (t.closest(".opt, .order, .hint, .kps, .sky")) return;
  const dx = e.clientX - d.x, dy = e.clientY - d.y, dt = Date.now() - d.t;
  if (Math.abs(dx) > 10 || Math.abs(dy) > 10 || dt > 450) return;
  if (String(getSelection && getSelection())) return;
  // Only the outer quarter on each side navigates (left = back, right = next). The middle half does nothing.
  const x = e.clientX / innerWidth, dir = x < EDGE ? -1 : x > 1 - EDGE ? 1 : 0;
  if (!dir) return;
  ghostUntil = Date.now() + 250; // the browser sends a click after this tap: swallow it so it can't hit the next screen's option
  nav(dir);
});
document.addEventListener("click", e => { if (Date.now() < ghostUntil) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);

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
  app().innerHTML = `<header class="top play"><div class="top-in"><button class="icon-btn" data-go="quiz-${esc(quiz.id)}" data-replace="1" aria-label="Back to the quiz" type="button">✕</button><div class="dots" role="img" aria-label="Round finished">${r.ids.map(() => `<i class="past"></i>`).join("")}</div><button class="icon-btn done" data-go="quiz-${esc(quiz.id)}" data-replace="1" type="button">Done</button></div></header>
  <main class="wrap play"><div class="endcard">
    <h2 id="endh" tabindex="-1">${allDone ? "That's the whole quiz." : "Round done"}</h2>
    <div class="ratio" role="img" aria-label="Right and wrong answers so far"><i class="g" id="rg" style="width:${prev.g}%"><b aria-hidden="true">✓</b></i><i class="r" id="rr" style="width:${prev.r}%"><b aria-hidden="true">✕</b></i>${answered ? "" : `<span class="empty-r"></span>`}</div>
    ${bestRun}
    ${allDone ? `<p>Come back in a few days and see what stuck.</p>` : ""}
    <div class="cta">${keep}${rev}</div>
  </div></main>`;
  const rg = $("#rg"), rr = $("#rr"); if (rg && rr) { rg.getBoundingClientRect(); requestAnimationFrame(() => requestAnimationFrame(() => { rg.style.width = gNow + "%"; rr.style.width = rNow + "%"; })); }
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
    toast("Saved"); go("quiz-" + quiz.id, true);
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
    <p class="note">Big file? Upload a chapter at a time and make one quiz per part.</p>
  </main>`;
  $("#mk-copy").onclick = () => { document.querySelector("details.how").open = true; copyText(prompt, $("#mk-text")); };
}

/* ---------------- events ---------------- */
// Dropdowns open by animating their real height (smooth on iPhone), then rest at "auto" so nested parts can grow.
function unfurl(box, open) {
  const u = box.querySelector(":scope > .unfurl"); if (!u) return;
  const start = u.getBoundingClientRect().height;
  if (u._a) { u._a.cancel(); u._a = null; }
  box.classList.toggle("open", open); u.inert = !open;
  u.style.height = open ? "auto" : "0px";
  const end = open ? u.getBoundingClientRect().height : 0;
  if (reduceMotion() || !u.animate || Math.abs(start - end) < 1) return;
  u._a = u.animate([{ height: start + "px" }, { height: end + "px" }], { duration: open ? 460 : 340, easing: "cubic-bezier(.32,.72,0,1)" });
  u._a.onfinish = () => { u._a = null; };
}
let armed = { el: null, t: 0 };
function twoTap(el, label) { if (armed.el === el && Date.now() - armed.t < 4000) { armed = { el: null, t: 0 }; return true; } armed = { el, t: Date.now() }; el.dataset.label = el.textContent; el.textContent = label; setTimeout(() => { if (el.isConnected && armed.el === el) { el.textContent = el.dataset.label; armed = { el: null, t: 0 }; } }, 4000); return false; }
document.addEventListener("click", e => {
  const t = e.target.closest("button, a, [data-go]"); if (!t) return;
  const d = t.dataset;
  if (d.setMode && DEEP_ON) { const first = !SET.mode; SET.mode = d.setMode; saveSet(); if (current) { current.mode = mode(); current.P = getProg(current.quiz.id); } route(); if (first) window.scrollTo(0, 0); else toast(MODES[SET.mode].name + " is on"); return; }
  if (d.go !== undefined) { go(d.go, d.replace !== undefined); return; }
  if (d.del) { if (!twoTap(t, "Tap again to delete")) return; LS.set(K_IMPORTED, getImported().filter(q => q.id !== d.del)); ["early", "deep"].forEach(m => LS.del(progKey2(d.del, m))); toast("Deleted"); go(""); return; }
  if (!current) return;
  if (d.pick !== undefined) return playAct("pick", t);
  if (d.toggle !== undefined) return playAct("toggle", t);
  if (d.mv !== undefined) return arrowMove(t);
  if (d.kp !== undefined) return playAct("kp", t);
  if (d.self) return playAct("self", t);
  if (d.act === "jump") { const j = t.closest(".jump"), o = !j.classList.contains("open"); unfurl(j, o); t.setAttribute("aria-expanded", o); return; }
  if (d.act === "partopen") { const p = t.closest(".part"), o = !p.classList.contains("open"); app().querySelectorAll(".part.open").forEach(x => { if (x !== p) { unfurl(x, false); x.querySelector(".part-row").setAttribute("aria-expanded", "false"); } }); unfurl(p, o); t.setAttribute("aria-expanded", o); return; }
  if (d.act === "partstart") return startRound({ only: +d.pi });
  if (d.act === "partreview") { const { quiz, P } = current, r = buildReview(quiz, P, +d.pi); if (!r) return toast("Nothing answered here yet."); P.round = r; P.cur = null; saveProg(); return go("play-" + quiz.id, true); }
  if (d.act === "partredo") { if (!twoTap(t, "Tap again to redo")) return; const { quiz, P } = current; eachQ(quiz, (q, id, si) => { if (si === +d.pi) { delete P.st[id]; delete P.a[id]; delete P.h[id]; } }); P.round = null; P.cur = null; saveProg(); return startRound({ only: +d.pi }); }
  if (d.act === "keeppart") return startRound({ only: current.P.round.only });
  const act = d.act; if (!act) return;
  if (act === "start") return startRound();
  if (act === "revisit") return startRound({ kind: "revisit" });
  if (act === "revisitround") { const { P } = current; const ids = P.round.ids.filter(x => P.round.res[x] === "miss" || P.round.res[x] === "partial"); ids.forEach(x => { delete P.a[x]; delete P.h[x]; P.n[x] = (P.n[x] || 0) + 1; }); P.round = { ids, i: 0, res: {}, kind: "revisit", streak: 0, ended: false }; P.cur = null; saveProg(); return renderPlay(); }
  if (act === "resume") return go("play-" + current.quiz.id, true);
  if (act === "share") return shareQuiz();
  if (act === "addtap") return sheet("Add tap options", `<p class="note">Paste this into any AI chat. It returns the same quiz with tap-to-answer options added. Import the result and choose <b>Replace it</b>.</p>`, addTapPrompt(current.quiz), "Copy prompt and quiz");
  if (act === "reset") { if (!twoTap(t, "Tap again to reset")) return; current.P = blankProg(); saveProg(); t.classList.add("ticked"); t.innerHTML = `<svg class="tick" viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 12.5l5 5L19.5 7"/></svg><span class="sr">Reset</span>`; t.disabled = true; return setTimeout(() => { if (current && /^#quiz-/.test(location.hash)) renderHome(); }, 850); }
  playAct(act, t);
});
document.addEventListener("toggle", e => {
  const d = e.target; if (!d || !d.classList || !d.classList.contains("more") || !d.open) return;
  setTimeout(() => d.scrollIntoView({ block: "nearest", behavior: reduceMotion() ? "auto" : "smooth" }), 40);
}, true);
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
  if (k === "h") click('[data-act="hint"]'); else if (k === "p") click('[data-act="pause"]');
});

/* ---------------- boot ---------------- */
window.SB = { TIME, durOf: durFor, fmt, validateQuiz, parseQuizText, formOf, buildRound, logSummary, nav, streakFeed };
applyView();
route();
loadSamples().then(route);
if ("serviceWorker" in navigator && location.protocol === "https:") {
  try {
    // When a new version takes over, reload once so the new files show straight away.
    const hadSW = !!navigator.serviceWorker.controller; let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => { if (!hadSW || reloaded) return; reloaded = true; location.reload(); });
    navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then(reg => { reg.update().catch(() => {}); }).catch(() => {});
    document.addEventListener("visibilitychange", () => { if (!document.hidden) navigator.serviceWorker.getRegistration().then(r => r && r.update()).catch(() => {}); });
  } catch (e) {}
}
})();
