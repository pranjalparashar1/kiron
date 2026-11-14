/* Study Buddy quiz player: static, no server. Quizzes are JSON; progress lives in this browser. */
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

/* ---------------- progress + grading ---------------- */
const blankProg = () => ({ a: {}, chk: {}, t: {}, tt: {}, self: {}, o: {}, h: {}, sec: 0, retry: null, seen: Date.now() });
function getProg(id) { return Object.assign(blankProg(), LS.get(progKey(id), {})); }
function saveProg(id, P) { P.seen = Date.now(); LS.set(progKey(id), P); }
const qid = (si, qi) => "s" + si + "q" + qi;
function eachQ(quiz, fn) { quiz.sections.forEach((s, si) => s.questions.forEach((q, qi) => fn(q, qid(si, qi), si, qi))); }

function shuffledOrder(id, n) {
  const idx = [...Array(n).keys()];
  let seed = 0; for (const ch of id) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0; seed = seed || 7;
  for (let i = n - 1; i > 0; i--) { seed = (seed * 1103515245 + 12345) >>> 0; const j = seed % (i + 1); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  if (idx.every((v, i) => v === i)) idx.reverse();
  return idx;
}
function parseNum(v) { const s = String(v == null ? "" : v).replace(/,/g, "").replace(/[−–—]/g, "-"); const m = s.match(/-?\d*\.?\d+/); return m ? parseFloat(m[0]) : null; }
function isBlank(q, v) {
  if (q.type === "text" || q.type === "number") return !v || !String(v).trim();
  if (q.type === "single") return v === undefined || v === null;
  if (q.type === "multi") return !v || !v.length;
  return false;
}
// returns "right" | "partial" | "miss" | "pending" | null (not checked)
function verdict(q, id, P) {
  if (!P.chk[id]) return null;
  if (P.o[id]) return P.o[id];
  const v = P.a[id];
  if (q.type === "text") {
    if (!q.keyPoints.length) return P.self[id] || "pending";
    const hasMatch = q.keyPoints.some(k => k.match.length);
    if (!hasMatch && !P.tt[id]) return isBlank(q, v) ? "miss" : "pending";
    const n = (P.t[id] || []).length, need = q.need || q.keyPoints.length;
    return n >= need ? "right" : (n > 0 && n >= need / 2 ? "partial" : "miss");
  }
  if (q.type === "single") return v === q.correct ? "right" : "miss";
  if (q.type === "multi") {
    const sel = new Set(v || []), cor = new Set(q.correct); let g = 0, b = 0;
    sel.forEach(i => cor.has(i) ? g++ : b++);
    if (g === cor.size && !b) return "right";
    return (g - b) / cor.size >= 0.5 ? "partial" : "miss";
  }
  if (q.type === "number") {
    const x = parseNum(v); if (x === null) return "miss";
    let ok = Math.abs(x - q.correct) <= q.tolerance + 1e-9;
    if (!ok && q.acceptSign) ok = Math.abs(Math.abs(x) - Math.abs(q.correct)) <= q.tolerance + 1e-9;
    return ok ? "right" : "miss";
  }
  if (q.type === "order") {
    const ord = v || shuffledOrder(id, q.items.length); let k = 0; ord.forEach((it, i) => { if (it === i) k++; });
    return k === q.items.length ? "right" : (k / q.items.length >= 0.5 ? "partial" : "miss");
  }
  return null;
}
const PTS = { right: 1, partial: 0.5, miss: 0 };
function stats(quiz, P, si) {
  let got = 0, done = 0, total = 0, right = 0;
  eachQ(quiz, (q, id, s) => {
    if (si !== undefined && s !== si) return;
    total++;
    const v = verdict(q, id, P);
    if (v && v in PTS) { done++; got += PTS[v]; if (v === "right") right++; }
  });
  return { got, done, total, right };
}
function autoTicks(q, text) {
  const toks = norm(text).split(" ").filter(Boolean);
  const out = [];
  if (toks.length) q.keyPoints.forEach((k, i) => { if (kpHit(k, toks)) out.push(i); });
  return out;
}

/* ---------------- routing ---------------- */
let current = null; // {quiz, mine, P}
function route() {
  const h = decodeURIComponent((location.hash || "").replace(/^#/, ""));
  if (h === "import") return renderImport();
  if (h === "make") return renderMake();
  if (h.startsWith("quiz-")) {
    const id = h.slice(5);
    const found = findQuiz(id);
    if (found) return renderQuiz(found);
    if (!samplesLoaded) return; // wait for samples, route() runs again
    toast("That quiz isn't on this device. Import it first.");
  }
  renderLibrary();
}
function go(h) { if (location.hash === "#" + h || (!h && !location.hash)) route(); else location.hash = h; }
window.addEventListener("hashchange", () => { route(); window.scrollTo(0, 0); });

const app = () => $("#app");
const topBar = (left, title, right, extra) => `<header class="top"><div class="top-in">${left || ""}${title}${right || ""}</div>${extra || ""}</header>`;
const backBtn = `<button class="icon-btn" data-go="" aria-label="Back to library" type="button">←</button>`;

/* ---------------- library ---------------- */
function renderLibrary() {
  current = null;
  document.title = "Study Buddy";
  const list = allQuizzes().map(x => ({ ...x, P: getProg(x.quiz.id) }))
    .sort((a, b) => (b.P.seen && Object.keys(b.P.chk).length ? b.P.seen : 0) - (a.P.seen && Object.keys(a.P.chk).length ? a.P.seen : 0));
  const card = x => {
    const s = stats(x.quiz, x.P);
    const pct = s.total ? Math.round(100 * s.right / s.total) : 0;
    return `<button class="card qcard" data-open="${esc(x.quiz.id)}" type="button">
      <div class="row" style="justify-content:space-between;align-items:flex-start;flex-wrap:nowrap"><h3>${esc(x.quiz.title)}</h3>${x.mine ? `<span class="badge mine">Yours</span>` : `<span class="badge">Sample</span>`}</div>
      ${x.quiz.source ? `<div class="meta">${esc(x.quiz.source)}</div>` : ""}
      <div class="meta"><span>${s.total} questions · ${x.quiz.sections.length} ${x.quiz.sections.length === 1 ? "part" : "parts"}</span><span>${s.done ? `${s.right} got right · ${s.done}/${s.total} checked` : "Not started"}</span></div>
      <div class="bar" aria-hidden="true"><i style="width:${pct}%"></i></div>
    </button>`;
  };
  const mine = list.filter(x => x.mine), samples = list.filter(x => !x.mine);
  app().innerHTML = topBar("", `<div class="brand"><img src="icon-192.png" alt="">Study Buddy</div>`) + `
  <main class="wrap">
    <div class="hello"><h2>Read it. Then prove you remember it.</h2><p>Answer from memory, check yourself against the key points, and retry only what you missed.</p></div>
    <div class="actions2">
      <button class="action main" data-go="make" type="button"><b>Make a quiz</b><span>From your own PDF, slides or Word file, using any AI chat.</span></button>
      <button class="action" data-go="import" type="button"><b>Import a quiz</b><span>Paste quiz text, or open a quiz file someone sent you.</span></button>
    </div>
    ${mine.length ? `<div class="label">Your quizzes</div>${mine.map(card).join("")}` : ""}
    <div class="label">${mine.length ? "Samples" : "Try a sample"}</div>
    ${samples.length ? samples.map(card).join("") : `<p class="empty">${samplesLoaded ? "No sample quizzes found." : "Loading…"}</p>`}
    <p class="note">Your answers and quizzes are saved on this device only. Nothing is sent anywhere.</p>
  </main>`;
}

/* ---------------- quiz ---------------- */
function renderQuiz(found) {
  const quiz = found.quiz;
  const P = getProg(quiz.id);
  if (P.sec >= quiz.sections.length) P.sec = 0;
  current = { quiz, mine: found.mine, P };
  document.title = quiz.title + " · Study Buddy";
  drawQuiz();
}
function visibleQs(si) {
  const { quiz, P } = current;
  return quiz.sections[si].questions.map((q, qi) => ({ q, qi, id: qid(si, qi) })).filter(x => !P.retry || P.retry.includes(x.id));
}
function drawQuiz(scrollTop) {
  const { quiz, P } = current;
  const si = P.sec;
  const showSummary = si === -1;
  const chips = quiz.sections.map((s, i) => {
    const st = stats(quiz, P, i);
    const hasRetry = !P.retry || visibleQs(i).length;
    return `<button class="chip${i === si ? " on" : ""}${st.done === st.total && st.total ? " done" : ""}" data-sec="${i}" type="button"${hasRetry ? "" : " disabled style=\"opacity:.4\""}>${quiz.sections.length > 1 ? (i + 1) + ". " : ""}${esc(s.title.length > 28 ? s.title.slice(0, 26) + "…" : s.title)}</button>`;
  }).join("") + `<button class="chip${showSummary ? " on" : ""}" data-sec="-1" type="button">Results</button>`;
  const tot = stats(quiz, P);
  const pct = tot.total ? Math.round(100 * tot.right / tot.total) : 0;
  const head = topBar(backBtn, `<h1>${esc(quiz.title)}</h1>`, `<button class="icon-btn" data-act="share" type="button" aria-label="Share this quiz">Share</button>`,
    `<div class="chips" role="tablist" aria-label="Parts">${chips}</div><div class="bar" style="border-radius:0" aria-hidden="true"><i style="width:${pct}%;border-radius:0"></i></div>`);
  let body = "";
  if (showSummary) body = summaryHTML();
  else {
    const sec = quiz.sections[si];
    const intro = si === 0 && !P.retry ? `<div class="intro">
      ${quiz.source ? `<div class="src">${esc(quiz.source)}</div>` : ""}
      ${quiz.about ? `<p>${fmt(quiz.about)}</p>` : ""}
      ${quiz.purpose ? `<div class="purpose"><b>Why you're reading this:</b> ${fmt(quiz.purpose)}</div>` : ""}
      ${quiz.sourceUrl ? `<p><a href="${esc(quiz.sourceUrl)}" target="_blank" rel="noopener">Open the source</a></p>` : ""}
      <details class="how"${Object.keys(P.chk).length ? "" : " open"}><summary>How this works</summary><ul>
        <li>Answer from memory. Typing it out is the point, even if it's rough.</li>
        <li>Stuck? <b>Show hint</b> gives a nudge. The question gets a “Hint used” tag.</li>
        <li>Press <b>Check this part</b>. For typed answers, tick the key points you actually covered. Some are pre-ticked when your words match; fix any that are wrong.</li>
        <li><b>Retry misses</b> clears only what you missed, so you can try those again.</li>
        <li>A <b>Discussion</b> tag means the answer isn't spelled out in the source.</li>
      </ul></details></div>` : "";
    const vis = visibleQs(si);
    const retryNote = P.retry ? `<div class="retry-note"><span>Retrying ${P.retry.length} missed ${P.retry.length === 1 ? "question" : "questions"}.</span><button class="btn small" data-act="showall" type="button">Show all questions</button></div>` : "";
    const st = stats(quiz, P, si);
    const anyChecked = vis.some(x => P.chk[x.id]);
    const anyMiss = vis.some(x => { const v = verdict(x.q, x.id, P); return v === "miss" || v === "partial"; });
    const last = si === quiz.sections.length - 1;
    const nextLabel = last ? "See results" : "Next part →";
    body = `${intro}${retryNote}
      <div class="sec-head">${quiz.sections.length > 1 ? `<span class="n">Part ${si + 1} of ${quiz.sections.length}${sec.ref ? " · " + esc(sec.ref) : ""}</span>` : (sec.ref ? `<span class="n">${esc(sec.ref)}</span>` : "")}<h2>${esc(sec.title)}</h2>${sec.why ? `<p>${fmt(sec.why)}</p>` : ""}</div>
      <div class="stack" id="qs">${vis.length ? vis.map(x => qHTML(x.q, x.id, si, x.qi)).join("") : `<p class="empty">Nothing to retry in this part.</p>`}</div>
      <div class="secfoot">
        ${anyChecked ? `<div class="score">This part: <b>${fmtPts(st.got)}</b> / ${st.total}${st.done < st.total ? ` · ${st.total - st.done} not marked yet` : ""}</div>` : ""}
        <div class="row">
          <button class="btn primary" data-act="check" type="button">${anyChecked ? "Check again" : "Check this part"}</button>
          ${anyChecked && anyMiss ? `<button class="btn" data-act="retrysec" type="button">Retry misses</button>` : ""}
          ${anyChecked ? `<button class="btn ghost" data-act="next" type="button">${nextLabel}</button>` : ""}
        </div>
      </div>`;
  }
  app().innerHTML = head + `<main class="wrap">${body}</main>`;
  const on = app().querySelector(".chip.on"); if (on) on.scrollIntoView({ block: "nearest", inline: "center" });
  if (scrollTop) window.scrollTo(0, 0);
}
const fmtPts = n => (Math.round(n * 10) / 10).toString();
const VLABEL = { right: "Got it", partial: "Partly", miss: "Missed", pending: "Mark yourself" };

function qHTML(q, id, si, qi) {
  const { P } = current;
  const v = verdict(q, id, P);
  const checked = !!P.chk[id];
  const a = P.a[id];
  const tags = q.tags.map(t => `<span class="tag ${t}">${t === "calc" ? "Calculation" : "Discussion"}</span>`).join("") + (P.h[id] ? `<span class="tag hintused">Hint used</span>` : "") + (q.ref ? `<span class="tag ref">${esc(q.ref)}</span>` : "");
  let input = "";
  const dis = checked && q.type !== "text" ? " disabled" : "";
  if (q.type === "text") {
    input = `<textarea id="in-${id}" data-in="${id}" placeholder="Type what you remember…" aria-label="Your answer">${esc(a || "")}</textarea>`;
  } else if (q.type === "number") {
    input = `<div class="row"><input class="num" type="text" inputmode="decimal" autocomplete="off" id="in-${id}" data-in="${id}" value="${esc(a || "")}" placeholder="Your answer" aria-label="Your answer"${dis}>${q.unit ? `<span class="unit">${esc(q.unit)}</span>` : ""}</div>`;
  } else if (q.type === "single" || q.type === "multi") {
    const sel = q.type === "single" ? [a] : (a || []);
    input = `<div class="opts" role="${q.type === "single" ? "radiogroup" : "group"}">` + q.options.map((o, i) => {
      let cls = "opt";
      if (checked) { const right = q.type === "single" ? i === q.correct : q.correct.includes(i); const chosen = sel.includes(i); if (chosen && right) cls += " ok"; else if (chosen) cls += " wrong"; else if (right) cls += " missed"; }
      return `<label class="${cls}" for="in-${id}-${i}"><input type="${q.type === "single" ? "radio" : "checkbox"}" name="in-${id}" id="in-${id}-${i}" data-opt="${id}" value="${i}"${sel.includes(i) ? " checked" : ""}${dis}><span>${fmt(o)}</span></label>`;
    }).join("") + `</div>` + (q.type === "multi" && !checked ? `<span class="note">Pick all that apply.</span>` : "");
  } else if (q.type === "order") {
    const ord = a || shuffledOrder(id, q.items.length);
    input = `<ol class="order">` + ord.map((it, pos) => {
      const cls = checked ? (it === pos ? " ok" : " wrong") : "";
      return `<li class="${cls.trim()}"><span class="p">${pos + 1}</span><span class="t">${fmt(q.items[it])}</span>${checked ? "" : `<button class="mv" type="button" data-mv="${id}" data-pos="${pos}" data-dir="-1" aria-label="Move up"${pos === 0 ? " disabled" : ""}>↑</button><button class="mv" type="button" data-mv="${id}" data-pos="${pos}" data-dir="1" aria-label="Move down"${pos === ord.length - 1 ? " disabled" : ""}>↓</button>`}</li>`;
    }).join("") + `</ol>`;
  }
  const hint = q.hint ? (P.h[id] ? `<div class="hint"><b>Hint</b>${fmt(q.hint)}</div>` : (checked ? "" : `<button class="hint-btn" type="button" data-hint="${id}">Show hint</button>`)) : "";
  let fb = "";
  if (checked) {
    let detail = "";
    if (q.type === "text" && q.keyPoints.length) {
      const ticks = P.t[id] || [];
      const need = q.need || q.keyPoints.length;
      detail = `<p class="kplead">Tick what your answer covered${need < q.keyPoints.length ? ` (you need ${need} of ${q.keyPoints.length})` : ""}:</p><div class="kps">` + q.keyPoints.map((k, i) => `<label class="kp${ticks.includes(i) ? " on" : ""}" for="kp-${id}-${i}"><input type="checkbox" id="kp-${id}-${i}" data-kp="${id}" value="${i}"${ticks.includes(i) ? " checked" : ""}><span>${fmt(k.text)}</span></label>`).join("") + `</div>`;
    } else if (q.type === "text") {
      const s = P.self[id];
      detail = `<p class="kplead">Compare with the model answer, then mark yourself:</p><div class="selfmark">${["right", "partial", "miss"].map(k => `<button class="btn small${s === k ? " on" : ""}" type="button" data-self="${id}" data-v="${k}">${VLABEL[k]}</button>`).join("")}</div>`;
    } else if (q.type === "number") {
      const x = parseNum(a);
      detail = `<div class="yours">You: <b>${x === null ? "no answer" : esc(String(x))}</b> · Answer: <b>${esc(String(q.correct))}${q.unit ? " " + esc(q.unit) : ""}</b></div>`;
    } else if (q.type === "order" && v !== "right") {
      detail = `<div class="yours">Correct order: ${q.items.map((t, i) => `${i + 1}. ${fmt(t)}`).join(" · ")}</div>`;
    }
    const canOverride = !(q.type === "text");
    const ovr = canOverride ? `<button class="btn small ghost ovr" type="button" data-ovr="${id}">${P.o[id] ? "Undo my override" : (v === "right" ? "Count as missed" : "I had this")}</button>` : "";
    fb = `<div class="fb"><div class="verdict"><span class="pill ${v}">${VLABEL[v]}${P.o[id] ? " · your call" : ""}</span>${ovr}</div>${detail}<div class="model"><span class="k">${q.type === "text" ? "Model answer" : "Why"}</span>${fmt(q.answer)}</div></div>`;
  }
  return `<article class="q${v && v !== "pending" ? " v-" + v : ""}" id="card-${id}">
    <div class="qtop"><span class="qn">${si + 1}.${qi + 1}</span>${tags}</div>
    <p class="prompt">${fmt(q.prompt)}</p>${hint}${input}${fb}</article>`;
}
function redrawQ(id) {
  const m = id.match(/^s(\d+)q(\d+)$/); const si = +m[1], qi = +m[2];
  const el = document.getElementById("card-" + id);
  if (el) el.outerHTML = qHTML(current.quiz.sections[si].questions[qi], id, si, qi);
  refreshFoot();
}
function refreshFoot() {
  // keep the score line and chips honest after a tick or override, without a full redraw that would jump the page
  const { quiz, P } = current; const si = P.sec; if (si < 0) return;
  const st = stats(quiz, P, si);
  const sc = app().querySelector(".score");
  if (sc) sc.innerHTML = `This part: <b>${fmtPts(st.got)}</b> / ${st.total}${st.done < st.total ? ` · ${st.total - st.done} not marked yet` : ""}`;
  const tot = stats(quiz, P); const bar = app().querySelector(".top .bar > i"); if (bar) bar.style.width = (tot.total ? Math.round(100 * tot.right / tot.total) : 0) + "%";
  const chip = app().querySelector(`.chip[data-sec="${si}"]`); if (chip) chip.classList.toggle("done", st.done === st.total && st.total > 0);
}
function summaryHTML() {
  const { quiz, P } = current;
  const t = stats(quiz, P);
  const pct = t.total ? Math.round(100 * t.got / t.total) : 0;
  let misses = 0, hints = 0;
  eachQ(quiz, (q, id) => { const v = verdict(q, id, P); if (v === "miss" || v === "partial") misses++; if (P.h[id]) hints++; });
  const msg = !t.done ? "Nothing checked yet. Start with part 1." : pct >= 85 ? "That stuck. Come back in a few days and see if it still does." : pct >= 60 ? "Solid base. Retry the misses below, then reread those pages." : "A lot slipped. Skim the source once more, then retry the misses.";
  return `<div class="sum">
    <h2>Results</h2>
    <div class="big">${fmtPts(t.got)}<small> / ${t.total} · ${pct}%</small></div>
    <p style="margin:0">${msg}${hints ? ` You used ${hints} ${hints === 1 ? "hint" : "hints"}.` : ""}${t.done < t.total ? ` ${t.total - t.done} questions aren't marked yet.` : ""}</p>
    <div class="sumrows">${quiz.sections.map((s, i) => { const st = stats(quiz, P, i); return `<button class="sumrow" type="button" data-sec="${i}"><span>${quiz.sections.length > 1 ? (i + 1) + ". " : ""}${esc(s.title)}</span><span>${st.done ? fmtPts(st.got) + " / " + st.total : "not checked"}</span></button>`; }).join("")}</div>
    <div class="row">${misses ? `<button class="btn primary" data-act="retryall" type="button">Retry all ${misses} misses</button>` : ""}<button class="btn danger" data-act="reset" type="button">Start over</button>${current.mine ? `<button class="btn ghost danger" data-del="${esc(quiz.id)}" type="button">Delete this quiz</button>` : ""}</div>
  </div>`;
}

/* ---------------- quiz events ---------------- */
let resetArmed = 0;
function onQuizClick(e) {
  if (!current) return;
  const { quiz, P } = current; const id = quiz.id;
  const b = e.target.closest("button, input[data-kp]");
  if (!b) return;
  if (b.dataset.sec !== undefined) { P.sec = +b.dataset.sec; if (P.retry && P.sec >= 0 && !visibleQs(P.sec).length) P.retry = null; saveProg(id, P); drawQuiz(true); return; }
  if (b.dataset.hint) { P.h[b.dataset.hint] = true; saveProg(id, P); redrawQ(b.dataset.hint); return; }
  if (b.dataset.mv) {
    const qidv = b.dataset.mv, m = qidv.match(/^s(\d+)q(\d+)$/), q = quiz.sections[+m[1]].questions[+m[2]];
    const ord = (P.a[qidv] || shuffledOrder(qidv, q.items.length)).slice(); const pos = +b.dataset.pos, to = pos + (+b.dataset.dir);
    if (to < 0 || to >= ord.length) return;
    [ord[pos], ord[to]] = [ord[to], ord[pos]]; P.a[qidv] = ord; saveProg(id, P); redrawQ(qidv);
    const again = document.querySelector(`[data-mv="${qidv}"][data-pos="${to}"][data-dir="${b.dataset.dir}"]`) || document.querySelector(`[data-mv="${qidv}"][data-pos="${to}"]`); if (again) again.focus();
    return;
  }
  if (b.dataset.kp) {
    const q2 = b.dataset.kp; const i = +b.value; const s = new Set(P.t[q2] || []);
    if (b.checked) s.add(i); else s.delete(i);
    P.t[q2] = [...s].sort((x, y) => x - y); P.tt[q2] = true; saveProg(id, P);
    // update in place so the page doesn't jump
    const card = document.getElementById("card-" + q2); b.closest(".kp").classList.toggle("on", b.checked);
    const m = q2.match(/^s(\d+)q(\d+)$/); const q = quiz.sections[+m[1]].questions[+m[2]]; const v = verdict(q, q2, P);
    card.className = "q" + (v && v !== "pending" ? " v-" + v : ""); const pill = card.querySelector(".pill"); pill.className = "pill " + v; pill.textContent = VLABEL[v];
    refreshFoot(); return;
  }
  if (b.dataset.self) { P.self[b.dataset.self] = b.dataset.v; saveProg(id, P); redrawQ(b.dataset.self); return; }
  if (b.dataset.ovr) {
    const q2 = b.dataset.ovr;
    if (P.o[q2]) delete P.o[q2];
    else { const m = q2.match(/^s(\d+)q(\d+)$/); const q = quiz.sections[+m[1]].questions[+m[2]]; P.o[q2] = verdict(q, q2, P) === "right" ? "miss" : "right"; }
    saveProg(id, P); redrawQ(q2); return;
  }
  const act = b.dataset.act;
  if (act === "check") {
    visibleQs(P.sec).forEach(({ q, id: q2 }) => {
      if (q.type === "text" && q.keyPoints.length && !P.tt[q2]) P.t[q2] = autoTicks(q, P.a[q2]);
      P.chk[q2] = true;
    });
    saveProg(id, P); drawQuiz();
    const first = app().querySelector(".q .fb"); if (first) first.closest(".q").scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    return;
  }
  if (act === "next") { P.sec = P.sec + 1 >= quiz.sections.length ? -1 : P.sec + 1; if (P.retry && P.sec >= 0) { while (P.sec >= 0 && P.sec < quiz.sections.length && !visibleQs(P.sec).length) P.sec = P.sec + 1 >= quiz.sections.length ? -1 : P.sec + 1; } saveProg(id, P); drawQuiz(true); return; }
  if (act === "retrysec" || act === "retryall") {
    const ids = [];
    eachQ(quiz, (q, q2, si) => { if (act === "retrysec" && si !== P.sec) return; const v = verdict(q, q2, P); if (v === "miss" || v === "partial" || (act === "retryall" && v === "pending")) ids.push(q2); });
    if (!ids.length) return;
    ids.forEach(q2 => { delete P.a[q2]; delete P.chk[q2]; delete P.t[q2]; delete P.tt[q2]; delete P.self[q2]; delete P.o[q2]; delete P.h[q2]; });
    P.retry = ids;
    if (act === "retryall") { P.sec = 0; while (P.sec < quiz.sections.length && !visibleQs(P.sec).length) P.sec++; if (P.sec >= quiz.sections.length) P.sec = 0; }
    saveProg(id, P); drawQuiz(true); return;
  }
  if (act === "showall") { P.retry = null; saveProg(id, P); drawQuiz(true); return; }
  if (act === "reset") {
    if (Date.now() - resetArmed > 4000) { resetArmed = Date.now(); b.textContent = "Tap again to clear every answer"; return; }
    resetArmed = 0; const fresh = blankProg(); current.P = fresh; saveProg(id, fresh); drawQuiz(true); toast("Cleared. Fresh start."); return;
  }
  if (act === "share") { shareQuiz(); return; }
}
function onQuizInput(e) {
  if (!current) return;
  const { quiz, P } = current;
  const t = e.target;
  if (t.dataset.in) { P.a[t.dataset.in] = t.value; saveProg(quiz.id, P); return; }
  if (t.dataset.opt) {
    const q2 = t.dataset.opt; const m = q2.match(/^s(\d+)q(\d+)$/); const q = quiz.sections[+m[1]].questions[+m[2]];
    if (q.type === "single") P.a[q2] = +t.value;
    else P.a[q2] = [...document.querySelectorAll(`input[data-opt="${q2}"]`)].filter(x => x.checked).map(x => +x.value);
    saveProg(quiz.id, P);
  }
}
function exportQuiz(q) { const o = Object.assign({}, q); return JSON.stringify(o, null, 2); }
function shareQuiz() {
  const { quiz } = current;
  const text = exportQuiz(quiz);
  const app_ = app();
  const box = document.createElement("div");
  box.className = "card"; box.id = "sharebox";
  box.innerHTML = `<b>Share “${esc(quiz.title)}”</b><p class="note" style="margin:0">Send this quiz text to a friend (WhatsApp, email, anything). They open Study Buddy, tap <b>Import a quiz</b> and paste it. Your answers are not included.</p>
    <div class="row"><button class="btn primary" type="button" id="share-copy">Copy quiz text</button>${navigator.share ? `<button class="btn" type="button" id="share-native">Send as file…</button>` : ""}<button class="btn ghost" type="button" id="share-close">Close</button></div>
    <pre class="prompt-text" id="share-text">${esc(text)}</pre>`;
  const old = $("#sharebox"); if (old) old.remove();
  app_.querySelector("main").prepend(box);
  window.scrollTo(0, 0);
  $("#share-copy").onclick = () => copyText(text, $("#share-text"));
  $("#share-close").onclick = () => box.remove();
  const ns = $("#share-native");
  if (ns) ns.onclick = async () => {
    try {
      const file = new File([text], quiz.id + ".json", { type: "application/json" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: quiz.title });
      else await navigator.share({ title: quiz.title, text });
    } catch (e) { if (e && e.name !== "AbortError") toast("Sharing isn't available here. Use Copy instead."); }
  };
}

/* ---------------- import ---------------- */
let pending = null;
function renderImport() {
  current = null; document.title = "Import a quiz · Study Buddy";
  app().innerHTML = topBar(backBtn, `<h1>Import a quiz</h1>`) + `<main class="wrap">
    <div class="page-h"><h2>Add a quiz</h2><p>Paste the quiz text an AI made for you (see <a href="#make">Make a quiz</a>), or one a friend sent you. You can also open a <b>.json</b> quiz file.</p></div>
    <textarea id="imp-text" style="min-height:180px;font-family:var(--mono);font-size:14px" placeholder='Paste here. It starts with {"format": "study-buddy-quiz", …' aria-label="Quiz text"></textarea>
    <div class="row">
      <button class="btn primary" id="imp-go" type="button">Import</button>
      <label class="btn file-btn" for="imp-file">Open a file…<input type="file" id="imp-file" accept=".json,.txt,application/json,text/plain"></label>
    </div>
    <div id="imp-out"></div>
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
  const imp = getImported();
  const clash = imp.find(q => q.id === quiz.id) || SAMPLES.find(s => s.quiz.id === quiz.id);
  pending = quiz;
  let n = 0; quiz.sections.forEach(s => n += s.questions.length);
  $("#imp-out").innerHTML = `<div class="ok-box"><b>Looks good: “${esc(quiz.title)}”</b><span>${n} questions in ${quiz.sections.length} ${quiz.sections.length === 1 ? "part" : "parts"}.</span>
    ${clash ? `<span>You already have a quiz with this name. Replacing it keeps your answers to questions that didn't change position.</span><div class="row"><button class="btn primary" id="imp-replace" type="button">Replace it</button><button class="btn" id="imp-both" type="button">Keep both</button></div>` : `<div class="row"><button class="btn primary" id="imp-save" type="button">Save and open</button></div>`}</div>`;
  const save = (asNew) => {
    let list = getImported();
    if (asNew) { let k = 2; while (allQuizzes().some(x => x.quiz.id === quiz.id + "-" + k)) k++; quiz.id = quiz.id + "-" + k; quiz.title = quiz.title + " (" + k + ")"; }
    list = list.filter(q => q.id !== quiz.id); list.unshift(quiz);
    if (!LS.set(K_IMPORTED, list)) { showImportErrors(["This device's storage is full or blocked (private browsing?), so the quiz couldn't be saved."]); return; }
    toast("Saved"); go("quiz-" + quiz.id);
  };
  if ($("#imp-save")) $("#imp-save").onclick = () => save(false);
  if ($("#imp-replace")) $("#imp-replace").onclick = () => save(false);
  if ($("#imp-both")) $("#imp-both").onclick = () => save(true);
}

/* ---------------- make a quiz (prompt) ---------------- */
function renderMake() {
  current = null; document.title = "Make a quiz · Study Buddy";
  const prompt = window.SB_PROMPT || "";
  app().innerHTML = topBar(backBtn, `<h1>Make a quiz</h1>`) + `<main class="wrap">
    <div class="page-h"><h2>Turn your notes into a quiz</h2><p>Study Buddy has no AI of its own. Any AI chat can write the quiz for you; this prompt tells it exactly how. It takes about two minutes.</p></div>
    <ol class="steps">
      <li><div><b>Copy the prompt</b><span>The button below copies it.</span></div></li>
      <li><div><b>Open ChatGPT, Claude or Gemini</b><span>The free version is fine. Start a new chat, paste the prompt and attach your PDF, slides or Word file.</span></div></li>
      <li><div><b>Answer its two questions</b><span>What you're reading it for, and how long a quiz you want. The purpose is what keeps the questions useful.</span></div></li>
      <li><div><b>Copy the code block it gives back</b><span>Most chats have a copy button on the block. Get all of it, from the first { to the last }.</span></div></li>
      <li><div><b>Import it here</b><span>Tap <b>Import a quiz</b> and paste. If something's off, the app tells you what to ask the AI to fix.</span></div></li>
    </ol>
    <div class="row"><button class="btn primary" id="mk-copy" type="button">Copy the prompt</button><button class="btn" data-go="import" type="button">Import a quiz</button></div>
    <details class="how"><summary>Read the prompt</summary><pre class="prompt-text" id="mk-text">${esc(prompt)}</pre></details>
    <p class="note">Big file? Free AI plans limit file size. Split it, or upload a chapter or section at a time and make one quiz per part.</p>
  </main>`;
  $("#mk-copy").onclick = () => { const d = document.querySelector("details.how"); d.open = true; copyText(prompt, $("#mk-text")); };
}

/* ---------------- library events ---------------- */
document.addEventListener("click", e => {
  const g = e.target.closest("[data-go]");
  if (g) { go(g.dataset.go); return; }
  const o = e.target.closest("[data-open]");
  if (o) { go("quiz-" + o.dataset.open); return; }
  if (current && app().contains(e.target)) onQuizClick(e);
});
document.addEventListener("input", onQuizInput);
document.addEventListener("change", e => { if (e.target.dataset && e.target.dataset.opt) onQuizInput(e); });

/* delete an imported quiz: long-press alternative = button on the quiz's results screen */
document.addEventListener("click", e => {
  const d = e.target.closest("[data-del]"); if (!d) return;
  if (d.dataset.armed !== "1") { d.dataset.armed = "1"; d.textContent = "Tap again to delete"; setTimeout(() => { if (d.isConnected) { d.dataset.armed = ""; d.textContent = "Delete this quiz"; } }, 4000); return; }
  LS.set(K_IMPORTED, getImported().filter(q => q.id !== d.dataset.del)); LS.del(progKey(d.dataset.del)); toast("Deleted"); go("");
});
/* ---------------- boot ---------------- */
window.SB = { validateQuiz, parseQuizText, verdict, autoTicks };
route();
loadSamples().then(route);
if ("serviceWorker" in navigator && location.protocol === "https:") {
  try { navigator.serviceWorker.register("sw.js").catch(() => {}); } catch (e) {}
}
})();
