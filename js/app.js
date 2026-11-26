/* Kiron quiz player: static, no server. Quizzes are JSON; progress lives in this browser.
   This file is the app itself: the router, the screens (library, quiz home, player, round end), the timer, the fire,
   and every event listener, registered here in one order. The parts it is built from live next to it in js/. */
import { $, esc, toast, toastHeld, app, topBar, backBtn, HX, hxAll, buzz, reduceMotion, GHOST } from "./ui.js";
import { LS, K_IMPORTED, getImported, progKey, blankProg, getProg, eachQ, getQ, freshen } from "./store.js";
import { validateQuiz } from "./validate.js";
import { shuffledOrder, orderStart, formOf, gradeMulti, gradeOrder, counts, isNumQ, buildRound, buildReview, TIME, durFor } from "./round.js";
import { fmt } from "./maths.js";
import { flowFrom, flowIn, cancelScroll, reveal, onScroll, settle, onTapXY, bloom, burst, heatLevel, cooled, heatIcon, barWidth, slideFrom,
  placeSky, placeGlint, onResize, EASE, fxLayer, clearFeed, fxAnim, streakFeed, onSpringBack, edgeGlow, unfurl, fold } from "./fx.js";
import { hooks as orderHooks, TAP_ORDER, dragging, endDrag, placedOf, onOrderClick, onOrderKey, onOrderMenu, onOrderDown } from "./order.js";

// Text formatting (maths, **bold**, *italic*, line breaks) lives in maths.js: fmt().
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

/* ---------------- quiz library ---------------- */
let SAMPLES = [];   // [{file, quiz}]
let samplesLoaded = false;
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
function saveProg() { if (!current) return; current.P.seen = Date.now(); LS.set(progKey(current.quiz.id), current.P); }


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
  if (h === "import" || h === "make") return go("build", true);   // the old hidden screens are one screen now
  if (h === "build") return renderBuild();
  const m = h.match(/^(quiz|play)-(.+)$/);
  if (m) {
    if (openQuiz(m[2])) return m[1] === "play" ? renderPlay() : renderHome();
    if (!samplesLoaded) return;
    toast("That quiz isn't on this phone.");
  }
  renderLibrary();
}
// rep = replace the history entry instead of adding one, so Back from a round goes to the library, not round -> home -> round -> home.
function go(h, rep) { if (location.hash === "#" + h || (!h && !location.hash)) { route(); window.scrollTo(0, 0); } else if (rep) location.replace(location.pathname + location.search + "#" + h); else location.hash = h; }
window.addEventListener("hashchange", () => { cancelScroll(); route(); window.scrollTo(0, 0); flowIn(); });
/* ---------------- library: just the list ---------------- */
function renderLibrary() {
  current = null; document.title = "Kiron";
  const list = allQuizzes(), card = x => `<button class="qcard" data-go="quiz-${esc(x.quiz.id)}" type="button"><h3>${esc(x.quiz.title)}</h3><span class="chev" aria-hidden="true">›</span></button>`;
  // Kiron 1.6: the playtest quizzes sit on top; every other quiz is folded away in one dropdown (the same fold as "Jump to a part").
  // Kiron 1.7: quizzes you built yourself sit on top too, first; "Build your own" closes the list.
  const top = list.filter(x => x.mine).concat(list.filter(x => x.quiz.test && !x.mine)), rest = list.filter(x => !x.quiz.test && !x.mine);
  const more = rest.length ? `<div class="jump more"><div class="jump-head"><button class="jump-btn" type="button" data-act="jump" aria-expanded="false">All quizzes<span class="car" aria-hidden="true">▾</span></button></div><div class="unfurl" inert><div class="fold"><div class="fold-in"><div class="grid">${rest.map(card).join("")}</div></div></div></div><i class="cap" aria-hidden="true"></i></div>` : "";
  app().innerHTML = topBar("", `<div class="brand"><img src="icon-192.png" alt="">Kiron</div>`) + `
  <main class="wrap lib">
    <h1 class="pick">Pick your quiz</h1>
    ${list.length ? `${top.length ? `<div class="grid">${top.map(card).join("")}</div>` : ""}${more}` : `<div class="grid"><p class="empty">${samplesLoaded ? "No quizzes yet." : "Loading…"}</p></div>`}
    ${samplesLoaded ? `<div class="grid"><button class="qcard build-card" data-go="build" type="button"><h3>Build your own</h3><span class="chev" aria-hidden="true">+</span></button></div>` : ""}
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
function renderPlay(keepScroll) {
  endDrag(); fireStop();
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
  const a = P.a[id], gone = burntOf(r, id);   // options the fire burned away stay gone (one still burning stays a moment)
  if (f.kind === "pick") {
    const ord = current.quiz.fixed || /\b(all|none|both) of|\babove\b|\bboth [a-d]\b/i.test(f.options.join(" ")) ? f.options.map((_, i) => i) : shuffledOrder(id + ":" + (P.n[id] || 0), f.options.length);
    input = `<div class="opts" role="group" aria-label="Options">` + ord.filter(oi => oi === BURNING || !gone.includes(oi)).map(oi => {
      let cls = "opt" + (oi === BURNING ? " burning" : ""), ic = "";
      // Once answered, the right answer (and your pick, if it was off) stay bright. The others stay in place, faded and
      // a little smaller, so a mis-tap is easy to spot and the explanation still fits without a long scroll.
      if (cur.done) { if (oi === f.correct) { cls += " ok"; ic = "✓"; } else if (a === oi) { cls += " wrong"; ic = "✕"; } else cls += " dim"; }
      if (fx && fx.oi === oi) cls += fx.kind === "right" ? " pop" : " sink";
      else if (fx && fx.oi !== undefined && fx.kind !== "right" && oi === f.correct) cls += " lift";   // a wrong pick: the right answer rises gently
      return `<button type="button" class="${cls}" data-key="${oi}" data-pick="${oi}"${cur.done ? ' aria-disabled="true" tabindex="-1"' : ""}>${ic ? `<span class="k">${ic}</span>` : ""}<span>${fmt(f.options[oi])}</span>${oi === BURNING ? CHAR : ""}</button>`;
    }).join("") + `</div>`;
  } else if (f.kind === "multi") {
    const sel = a || [];
    input = `<p class="lead">Pick all that apply.</p><div class="opts" role="group" aria-label="Options">` + q.options.map((o, i) => {
      if (i !== BURNING && gone.includes(i)) return "";
      let cls = "opt" + (sel.includes(i) ? " sel" : "") + (i === BURNING ? " burning" : ""), ic = sel.includes(i) ? "✓" : "";
      // Once checked it reads like a single-answer question: a right pick is solid green with a tick, a wrong pick is red with
      // a cross, and a right option you did not pick is a quieter green with a tick. Everything else fades back, with no mark.
      let mark = `<span class="k box">${ic}</span>`;
      if (cur.done) { const right = q.correct.includes(i), ch = sel.includes(i); cls = "opt" + (ch && right ? " ok" : ch ? " wrong dim" : right ? " missed" : " dim"); mark = right ? `<span class="k">✓</span>` : ch ? `<span class="k">✕</span>` : ""; }
      return `<button type="button" class="${cls}" data-key="${i}" data-toggle="${i}" aria-pressed="${sel.includes(i)}"${cur.done ? ' aria-disabled="true" tabindex="-1"' : ""}>${mark}<span>${fmt(o)}</span>${i === BURNING ? CHAR : ""}</button>`;
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
  const hintBtn = q.hint && !P.h[id] && !cur.done && !r.review ? `<button class="btn ghost hintb" data-act="hint" type="button">💡 Hint</button>` : "";
  const bar = cur.done
    ? `${back}<button class="btn primary grow" data-act="next" type="button">${r.i + 1 >= r.ids.length ? (r.review ? "Done" : "Finish") : "Next"}</button>`
    : `${back}${hintBtn}${primary === "check" ? `<button class="btn primary grow${waiting ? " soft" : ""}" data-act="check" type="button">Check</button>` : ""}`;
  const long = f.prompt.length > 150 ? " long" : "";
  const isNum = isNumQ(q);
  // Streak: the bar takes on the streak's colour. On a fresh right answer from 3 in a row, the bar first shows the old level, then the counter flies in and lifts it.
  const stk = r.review ? 0 : r.streak || 0, feeding = fx && fx.kind === "right" && stk >= 3, heatNow = heatLevel(feeding ? stk - 1 : stk);
  const html = `<header class="top play"><div class="top-in"><button class="icon-btn" data-go="quiz-${esc(quiz.id)}" data-replace="1" aria-label="Leave this round" type="button">✕</button><div class="dots${PAUSED ? " halted" : ""}" data-heat="${heatNow}" role="img" aria-label="Question ${r.i + 1} of ${r.ids.length}${stk >= 3 ? ", " + stk + " in a row" : ""}">${dots}</div>${r.review ? "" : `<button type="button" class="heat${heatNow ? " on" : ""}" data-heat="${heatNow}" data-act="fire" aria-label="${feeding ? stk - 1 : stk} in a row"${heatNow ? "" : ' tabindex="-1" aria-hidden="true"'}><span class="fl" aria-hidden="true">${heatIcon(heatNow)}</span><b class="n" aria-hidden="true">${feeding ? stk - 1 : stk}</b></button>`}${r.review ? "" : `<button class="icon-btn pause${PAUSED ? " on" : ""}${cur.done ? " gone" : ""}" data-act="pause" type="button" aria-pressed="${!!PAUSED}" aria-label="${PAUSED ? "Resume timer" : "Pause timer"}"${cur.done ? ' disabled aria-hidden="true" tabindex="-1"' : ""}>${PAUSED ? `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5l11 7-11 7z"/></svg>` : `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>`}</button>`}</div></header>
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
  if (keyed(ac) && keyed(bc)) return patchKeyed(a, ac, bc);
  bc.forEach((n, i) => {
    const o = ac[i];
    if (!o) a.appendChild(n);
    else if (!sameQ && n.nodeName === "MAIN") o.replaceWith(n);
    else morph(o, n);
  });
  for (let i = bc.length; i < ac.length; i++) ac[i].remove();
}
/* Lists whose children all carry data-key (the answer options) are matched by key, not by position. An option that
   leaves (burned) or stays is always matched with itself, so an element left with a fill-forwards animation can never
   be poured into its neighbour (the 1.5.4 ghost). */
const keyed = list => list.length > 0 && list.every(n => n.nodeType === 1 && n.hasAttribute("data-key"));
function patchKeyed(a, ac, bc) {
  const key = n => n.getAttribute("data-key"), old = new Map(ac.map(n => [key(n), n])), want = new Set(bc.map(key));
  ac.forEach(n => { if (!want.has(key(n))) n.remove(); });   // what left goes first; nothing else moves for it
  let prev = null;
  bc.forEach(n => {
    const o = old.get(key(n));
    let el = n;
    if (o) { morph(o, n); if (o.isConnected) el = o; }   // morph swaps in the new node when the two can't be patched
    const next = prev ? prev.nextSibling : a.firstChild;
    if (el !== next) a.insertBefore(el, next);
    prev = el;
  });
}
function morph(a, b) {
  if (a.nodeType !== b.nodeType || a.nodeName !== b.nodeName || (b.nodeType === 1 && b.classList.contains("dots"))) return a.replaceWith(b);
  if (a.nodeType !== 1) { if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue; return; }
  if (a.isEqualNode(b)) return;
  for (const { name } of [...a.attributes]) if (!b.hasAttribute(name)) a.removeAttribute(name);
  for (const { name, value } of [...b.attributes]) if (a.getAttribute(name) !== value) a.setAttribute(name, value);
  patchKids(a, b, true);
}
// Effects that watch the page (registered here so every listener keeps its place in the order the app has always had).
addEventListener("scroll", onScroll, { passive: true });
document.addEventListener("click", onTapXY, true);
addEventListener("resize", onResize);
function finalize(status) {
  const { quiz, P } = current, r = P.round, id = P.cur.id;
  const first = !P.cur.done;
  P.cur.done = true; P.cur.status = status;
  P.st[id] = status; r.res[id] = status;
  if (first) {
    r.streak = status === "right" ? (r.streak || 0) + 1 : cooled(r.streak || 0); r.best = Math.max(r.best || 0, r.streak);
    FX = { id, kind: status === "right" ? "right" : "wrong" };
  }
  else if (status !== "right") r.streak = cooled(r.streak || 0);
  saveProg();
}
/* ---- Kiron 1.5.3: the fire answers a touch.
   A tap: a small bubble under it says what it does, and goes by itself. Before the question is answered, with a wrong
   option still left to burn, it says "Hold the fire for a surprise" (after the first time: what the surprise is);
   otherwise it just says the streak.
   A hold (only then): the fire swells like a balloon, faster and faster, trembling at the end. Let go early and it sinks
   back. Hold on and it pops: a flash and sparks where it was, a fireball arcs down onto one wrong option, which burns
   away (embers rise, it fades), and the options below close the gap. It costs one from the streak. If only right
   answers are left, the streak goes back to 0. Below 3 the fire goes out, so there is nothing left to hold.
   Multi-select burns one option that is not right; ordering questions have nothing to burn. Burned options stay gone
   for the rest of the round. Transform and opacity only, Web Animations, pieces built once (the fx layer). ---- */
const K_BURNT = "kiron:burnt", CHAR = `<i class="char" aria-hidden="true">${"<b></b>".repeat(7)}</i>`;
let BURNING = null, FIRE = null;
const burntOf = (r, id) => (r && !r.review && r.burn && r.burn[id]) || [];
// What a hold would burn now: the wrong options still showing. Nothing once answered, in review, or with no fire.
function burnPlan() {
  const P = current && current.P, r = P && P.round; if (!r || r.review || r.ended || !P.cur || P.cur.done || BURNING !== null || heatLevel(r.streak || 0) < 1) return null;
  const { q, id } = getQ(current.quiz, r.ids[r.i]), f = formOf(q), opts = f.kind === "pick" ? f.options : f.kind === "multi" ? q.options : null; if (!opts) return null;
  const gone = burntOf(r, id), isRight = i => f.kind === "pick" ? i === f.correct : q.correct.includes(i);
  const left = opts.map((_, i) => i).filter(i => !isRight(i) && !gone.includes(i));
  return left.length ? { P, r, id, kind: f.kind, gone, left } : null;
}
function fireStop(popped) {
  if (!FIRE) return; const { a, off } = FIRE; FIRE = null; off();
  if (a && !popped) { a.updatePlaybackRate(-3); a.finished.then(() => a.cancel()).catch(() => {}); }   // sinks back, quicker than it grew
}
document.addEventListener("contextmenu", e => { if (e.target.closest && e.target.closest(".heat")) e.preventDefault(); });
document.addEventListener("pointerdown", e => {
  const slot = e.target.closest && e.target.closest(".heat.on:not(.pre)"); if (!slot || !current || e.button > 0) return;
  fireStop();
  const fl = slot.querySelector(".fl"), plan = burnPlan(), t0 = Date.now(), pid = e.pointerId; let a = null, timer = 0;
  if (plan && !reduceMotion() && fl.animate) {
    // One swell on one accelerating curve; the tremble is folded into its last fifth, so it never stops on the way.
    const t = (s, r, y) => ({ transform: `translateY(${y}px) scale(${s}) rotate(${r}deg)` });
    a = fl.animate([t(1, 0, 0), Object.assign(t(2.6, 0, 12), { offset: .8 }), Object.assign(t(2.8, -7, 13), { offset: .85 }), Object.assign(t(2.95, 7, 14), { offset: .9 }), Object.assign(t(3.1, -8, 14), { offset: .95 }), t(3.25, 6, 15)],
      { duration: 1000, easing: "cubic-bezier(.4,0,.75,.6)", fill: "forwards", composite: "add" });
    a.finished.then(() => { if (FIRE && FIRE.a === a && a.playbackRate > 0) { fireStop(true); firePop(a); } }).catch(() => {});
  } else if (plan) timer = setTimeout(() => { if (FIRE && FIRE.timer === timer) { fireStop(true); firePop(null); } }, 900);
  const up = ev => { if (ev.pointerId !== pid || !FIRE) return; const tap = Date.now() - t0 < 300; fireStop(); if (tap && ev.type === "pointerup") if (t0 - TIP_SHUT > 60) fireTip(burnPlan() ? (LS.get(K_BURNT) ? "Hold to burn a wrong option" : "Hold the fire for a surprise") : `${current.P.round.streak || 0} in a row`, slot); };
  const off = () => { clearTimeout(timer); removeEventListener("pointerup", up, true); removeEventListener("pointercancel", up, true); };
  addEventListener("pointerup", up, true); addEventListener("pointercancel", up, true);
  FIRE = { a, timer, off };
});
function firePop(swell) {
  const p = burnPlan(), slot = $(".heat.on"), fl = slot && slot.querySelector(".fl"); if (!p || !fl) { if (swell) swell.cancel(); return; }
  const oi = p.left[Math.floor(Math.random() * p.left.length)], b = fl.getBoundingClientRect(), x0 = b.left + b.width / 2, y0 = b.top + b.height / 2, lvl0 = heatLevel(p.r.streak);
  // The cost, saved at once: one off the streak, or all of it once only right answers are left.
  (p.r.burn = p.r.burn || {})[p.id] = p.gone.concat(oi);
  p.r.streak = p.left.length === 1 ? 0 : p.r.streak - 1;
  if (p.kind === "multi" && Array.isArray(p.P.a[p.id])) p.P.a[p.id] = p.P.a[p.id].filter(i => i !== oi);
  saveProg(); LS.set(K_BURNT, 1); buzz([18, 40, 26]);
  BURNING = oi; renderPlay(true);   // the count drops (or the fire goes out); the option is marked, still in place
  const opt = app().querySelector(`.opt.burning`), still = reduceMotion() || !fl.animate;
  if (still || !opt) { if (swell) swell.cancel(); return fireDone(p.id); }
  // POP: the balloon is gone in a frame; the fire grows back from nothing if there is still a streak.
  if (slot.classList.contains("on")) fl.animate([{ transform: "scale(0)" }, { transform: "scale(1)" }], { duration: 560, delay: 120, easing: EASE.appear, fill: "backwards", composite: "add" });
  else fl.animate([{ opacity: 0 }, { opacity: 0 }], { duration: 300 });
  swell.cancel();
  clearFeed(); const fx = fxLayer(); fx.dataset.heat = lvl0; fx.classList.add("run");
  const burst = fx.querySelector(".fx-burst"); burst.style.transform = `translate3d(${x0}px,${y0}px,0)`;
  fxAnim(burst.querySelector(".fx-flash"), [{ opacity: 1, transform: "scale(.5)" }, { opacity: 0, transform: "scale(1.7)" }], { duration: 300, easing: EASE.out });
  fxAnim(burst.querySelector(".fx-ring"), [{ opacity: 1, transform: "scale(.3)" }, { opacity: 0, transform: "scale(1.5)" }], { duration: 420, easing: EASE.out });
  burst.querySelectorAll("i").forEach((sp, i) => { const ang = Math.PI * 2 * i / 16 + (i % 2 ? .2 : -.2), r = 34 + (i % 3) * 12;
    fxAnim(sp, [{ opacity: 1, transform: "translate3d(0,0,0) scale(1.4)" }, { opacity: 0, transform: `translate3d(${(Math.cos(ang) * r).toFixed(1)}px,${(Math.sin(ang) * r).toFixed(1)}px,0) scale(.3)` }], { duration: 480 + (i % 3) * 60, easing: EASE.out }); });
  // FLY: a fireball arcs out and drops onto the option (sideways fast early, down faster late: one curve each).
  const o = opt.getBoundingClientRect(), x1 = o.left + o.width * (.3 + Math.random() * .4), y1 = o.top + o.height / 2, FLY = 420;
  const bx = fx.querySelector(".fx-bx"), ball = bx.querySelector(".fx-ball");
  fxAnim(bx, [{ transform: `translate3d(${x0}px,0,0)` }, { transform: `translate3d(${x1}px,0,0)` }], { duration: FLY, easing: "cubic-bezier(.2,.7,.4,1)" });
  fxAnim(bx.firstElementChild, [{ transform: `translate3d(0,${y0}px,0)` }, { transform: `translate3d(0,${y1}px,0)` }], { duration: FLY, easing: "cubic-bezier(.55,0,.85,.4)" });
  fxAnim(ball, [{ opacity: 1, transform: "scale(.7)" }, { opacity: 1, transform: "scale(1.5)", offset: .9 }, { opacity: 0, transform: "scale(2.4)" }], { duration: FLY + 60, easing: "linear" }).finished.then(() => burnOpt(opt, x1 - o.left, p.id)).catch(() => {});
}
/* The fire's little bubble (Kiron 1.5.6). While one is showing, the next tap anywhere only puts it away:
   it does not answer, move to another question or press a button. A tip is in the way of what you were reading, so
   the tap that clears it should do nothing else. The fire itself can still be picked up straight away. */
let TIP = null, TIP_UNTIL = 0, TIP_SWALLOW = false, TIP_SHUT = 0, TIP_ATE = 0;
function fireTip(text, anchor) {
  if (!anchor || !anchor.isConnected) return;
  if (!TIP || !TIP.isConnected) { TIP = document.createElement("div"); TIP.className = "firetip"; TIP.setAttribute("role", "status"); document.body.append(TIP); }
  const icon = anchor.querySelector(".fl") || anchor, b = icon.getBoundingClientRect(), up = b.top > innerHeight / 2;
  TIP.textContent = text; TIP.classList.toggle("up", up); TIP.style.cssText = "left:0;top:0";
  const w = TIP.offsetWidth, cx = b.left + b.width / 2, left = Math.max(12, Math.min(innerWidth - w - 12, cx - w / 2));
  TIP.style.cssText = `left:${left.toFixed(1)}px;${up ? `bottom:${(innerHeight - b.top + 12).toFixed(1)}px` : `top:${(b.bottom + 14).toFixed(1)}px`};--ax:${(cx - left).toFixed(1)}px`;
  TIP.getAnimations().forEach(x => x.cancel());
  TIP_UNTIL = Date.now() + 3200;
  if (!TIP.animate) return;
  TIP.animate([{ opacity: 0, transform: reduceMotion() ? "none" : `translateY(${up ? 8 : -8}px) scale(.6)` }, { opacity: 1, transform: "none" }], { duration: 520, easing: EASE.appear, fill: "forwards" });
  TIP.animate([{ opacity: 1 }, { opacity: 0, transform: "scale(.96)" }], { duration: 320, delay: 2880, easing: "ease-in", fill: "forwards" });
}
function hideTip() {
  TIP_UNTIL = 0; if (!TIP || !TIP.animate) return;
  TIP.getAnimations().forEach(x => x.cancel());
  TIP.animate([{ opacity: 1 }, { opacity: 0, transform: "scale(.96)" }], { duration: 160, easing: "ease-in", fill: "forwards" });
}
document.addEventListener("pointerdown", e => {
  if (Date.now() > TIP_UNTIL) return;
  hideTip(); TIP_SHUT = Date.now();
  if (!(e.target.closest && e.target.closest(".heat.on"))) TIP_SWALLOW = true;
}, true);
document.addEventListener("pointercancel", () => { TIP_SWALLOW = false; }, true);
document.addEventListener("pointerup", () => { if (TIP_SWALLOW) { TIP_SWALLOW = false; TIP_ATE = Date.now(); GHOST.until = Date.now() + 400; } }, true);
// BURN: the fire spreads from where the ball hit, embers rise, the option fades up and away. Then the gap closes.
function burnOpt(opt, hx, id) {
  if (!opt.isConnected) return fireDone(id);
  const ch = opt.querySelector(".char"), w = opt.offsetWidth, D = 640;
  ch.style.transformOrigin = `${hx.toFixed(0)}px 50%`;
  ch.animate([{ opacity: 0, transform: "scaleX(.1)" }, { opacity: 1, transform: "scaleX(1)", offset: .4 }, { opacity: 1, transform: "scaleX(1)" }], { duration: D, easing: "cubic-bezier(.2,.7,.3,1)", fill: "forwards" });
  ch.querySelectorAll("b").forEach((e, i) => { const x = (i + .5) / 7 * w;
    e.animate([{ opacity: 0, transform: `translate3d(${x.toFixed(0)}px,0,0)` }, { opacity: 1, transform: `translate3d(${x.toFixed(0)}px,-8px,0)`, offset: .3 }, { opacity: 0, transform: `translate3d(${(x + (i % 2 ? 8 : -8)).toFixed(0)}px,-${34 + (i % 3) * 10}px,0) scale(.4)` }], { duration: D, delay: Math.abs(x - hx) / w * 160, easing: "ease-out", fill: "both" }); });
  opt.animate([{ opacity: 1, transform: "none" }, { opacity: 1, transform: "scale(1.015)", offset: .35 }, { opacity: 0, transform: "translateY(-6px) scale(.94)" }], { duration: D + 120, easing: "cubic-bezier(.4,0,.6,1)", fill: "forwards" })
    .finished.then(() => fireDone(id)).catch(() => {});
}
// The burned option leaves the page; the ones below glide up into its place (one transform each).
function fireDone(id) {
  BURNING = null; clearFeed();
  const P = current && current.P; if (!P || !P.cur || P.cur.id !== id || app().dataset.qid !== id) return;
  const before = new Map([...app().querySelectorAll(".opt")].map(el => [el.dataset.pick || el.dataset.toggle, el.getBoundingClientRect().top]));
  // Take the burned button out first. Options are matched by key now (data-key), so it could no longer take the next
  // option with it (the 1.5.4 bug, a second option gone); taking it out first still keeps the patch to the minimum.
  const burnt = app().querySelector(".opt.burning"); if (burnt) burnt.remove();
  renderPlay(true);
  if (reduceMotion()) return;
  app().querySelectorAll(".opt").forEach(el => { const t0 = before.get(el.dataset.pick || el.dataset.toggle), dy = t0 - el.getBoundingClientRect().top;
    if (t0 !== undefined && Math.abs(dy) > 1) el.animate([{ transform: `translateY(${dy.toFixed(1)}px)` }, { transform: "none" }], { duration: 420, easing: EASE.drop }); });
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


// Ordering by hand (js/order.js): its four listeners, in their place.
orderHooks.cur = () => current; orderHooks.save = () => saveProg();
document.addEventListener("click", onOrderClick);
document.addEventListener("keydown", onOrderKey);
document.addEventListener("contextmenu", onOrderMenu);
document.addEventListener("pointerdown", onOrderDown);

/* ---- story-style edge taps: left quarter = back, right quarter = next (or "do this later" if unanswered). No swipes, no centre taps. ---- */
const EDGE = 0.25; // width of each tap zone, as a share of the screen
let tapDown = null;
document.addEventListener("pointerdown", e => { tapDown = { x: e.clientX, y: e.clientY, t: Date.now() }; }, true);
document.addEventListener("pointerup", e => {
  const d = tapDown; tapDown = null;
  if (Date.now() - TIP_ATE < 60) return;   // this tap only put a bubble away
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
  GHOST.until = Date.now() + 250; // the browser sends a click after this tap: swallow it so it can't hit the next screen's option
  if (dir > 0 || current.P.round.i > 0) edgeGlow(dir);
  nav(dir);
});
document.addEventListener("click", e => { if (Date.now() < GHOST.until) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
// Every tap answers (js/fx.js): the spring back from the pressed size.
document.addEventListener("click", onSpringBack, true);


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

/* ---------------- Build your own (#build) ----------------
   Its module (build.js, with parser.js and prompt.js) is imported only when it is opened. */
let buildMod = null;
function renderBuild() {
  current = null;
  if (!buildMod) buildMod = import("./build.js");
  buildMod.then(m => { if (location.hash === "#build") m.render({ go, findQuiz, allQuizzes }); }, () => { buildMod = null; toast("That screen couldn't load. Check your connection."); renderLibrary(); });
}

/* ---------------- events ---------------- */
let armed = { el: null, t: 0 };
function twoTap(el, label) { if (armed.el === el && Date.now() - armed.t < 4000) { armed = { el: null, t: 0 }; return true; } armed = { el, t: Date.now() }; el.dataset.label = el.textContent; el.textContent = label; setTimeout(() => { if (el.isConnected && armed.el === el) { el.textContent = el.dataset.label; armed = { el: null, t: 0 }; } }, 4000); return false; }
document.addEventListener("click", e => {
  const t = e.target.closest("button, a, [data-go]"); if (!t) return;
  const d = t.dataset;
  if (e.target.classList.contains("hx")) buzz(10);
  if (d.go !== undefined) { flowFrom(t); go(d.go, d.replace !== undefined); return; }
  if (d.del) { if (!twoTap(t, "Tap again to delete")) return; LS.set(K_IMPORTED, getImported().filter(q => q.id !== d.del)); LS.del(progKey(d.del)); toast("Deleted"); go(""); return; }
  if (d.act === "jump") { const j = t.closest(".jump"), o = !j.classList.contains("open"); t.setAttribute("aria-expanded", o); unfurl(j, o, o && j); return; }
  if (!current) return;
  if (d.pick !== undefined) return playAct("pick", t);
  if (d.toggle !== undefined) return playAct("toggle", t);
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
// A few internals, for bug reports and for poking at the app from the console.
window.SB = { trouble: TROUBLE, TIME, durOf: durFor, fmt, validateQuiz, formOf, buildRound, nav, streakFeed };
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
