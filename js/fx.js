/* Kiron: the effects. Screen-to-screen flow, the glide to the answer, the bloom and confetti on a right pick, the
   streak (flame, sky, reward flight), the edge glow and the fold every dropdown uses. Transform and opacity only.
   Nothing here listens by itself: the app registers the on* handlers in its own event order. */
import { $, app, buzz, reduceMotion } from "./ui.js";

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
function onScroll() {
  if (!SCROLLING) document.querySelectorAll(".top.play, .actionbar").forEach(el => el.classList.add("scrolling")); else clearTimeout(SCROLLING);
  SCROLLING = setTimeout(() => { SCROLLING = 0; document.querySelectorAll(".scrolling").forEach(el => el.classList.remove("scrolling")); }, 160);
}
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
function onTapXY(e) { TAPXY = e.clientX || e.clientY ? { x: e.clientX, y: e.clientY, t: Date.now() } : null; }
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
function onResize() { const s = $(".sky"), d = $(".dots"); if (s && d) placeSky(+d.dataset.heat || 0); if (d) placeGlint(+d.dataset.heat || 0); }
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
  h += `<div class="fx-x fx-bx"><div class="fx-y"><b class="fx-ball"></b></div></div>`;
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
/* ---- Kiron 1.4.1: every tap answers. The press itself is CSS (:active, instant). These two play only on a finished tap,
   never on a touch that became a scroll, and move transform or opacity only. ---- */
// Spring back from the pressed size.
function onSpringBack(e) {
  const b = e.target && e.target.closest ? e.target.closest(".icon-btn, .actionbar .btn.back, .jump-btn, .part-row") : null;
  if (!b || !b.animate || reduceMotion()) return;
  b.animate([{ transform: `scale(${b.matches(".jump-btn, .part-row") ? .97 : .9})` }, { transform: "none" }], { duration: 340, easing: "cubic-bezier(.3,1.6,.5,1)" });
}
// The side you tapped lights up and fades: two fixed layers, built once.
let EDGES = null;
function edgeGlow(dir) {
  if (reduceMotion() || !document.body.animate) return;
  if (!EDGES || !EDGES[0].isConnected) EDGES = ["l", "r"].map(s => { const el = document.createElement("i"); el.className = "edge " + s; el.setAttribute("aria-hidden", "true"); document.body.append(el); return el; });
  EDGES[dir < 0 ? 0 : 1].animate([{ opacity: 1 }, { opacity: 0 }], { duration: 420, easing: "ease-out" });
}
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
  // Page coordinates, not screen ones: shutting a box can make the page shorter than where it is scrolled to, and then
  // the phone pulls the page up, which would make everything look as if it had not moved.
  const top = el => el.getBoundingClientRect().top + window.scrollY;
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

export { flowFrom, flowIn, cancelScroll, smoothScrollTo, revealTarget, reveal, onScroll, settle, onTapXY, bloom, burst,
  BLACK_FIRE, STAGES, heatLevel, heatIcon, gradDefs, barWidth, slideFrom, slideBar, placeSky, placeGlint, onResize,
  EASE, kick, fxLayer, clearFeed, fxAnim, streakFeed, onSpringBack, edgeGlow, unfurl, fold, bottomGap };
