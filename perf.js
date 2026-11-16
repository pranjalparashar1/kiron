/* Kiron's hidden performance check. Fetched only after #perf has been opened once on this phone (open #perf again
   to turn it off), so it costs nothing otherwise. It watches the gap between frames while the app is on screen and
   counts dropped frames against whichever moment is playing (an answer, the streak flight, a scroll...), which
   app.js names with mark(). The small "perf" chip copies a plain-text report to paste into a thread.
   Limit: JavaScript only sees the main thread. Motion the GPU plays by itself shows as fine; motion that falls
   back to the main thread shows its drops, which is what this is here to catch. */
(function () {
"use strict";
if (window.KironPerf) return;
const stats = {}, live = {};   // label -> { runs, frames, dropped, worst } · label -> when its window ends
let raf = 0, last = 0, typical = 0, seen = 0, version = "";
const gaps = [];
const stat = l => stats[l] || (stats[l] = { runs: 0, frames: 0, dropped: 0, worst: 0 });
function count(l, gap, missed) { const s = stat(l); s.frames++; s.dropped += missed; if (gap > s.worst) s.worst = gap; }
function tick(t) {
  raf = requestAnimationFrame(tick);
  const gap = last ? t - last : 0, from = last; last = t;
  if (!gap || gap > 400) return;   // the first frame, or coming back from the background
  gaps.push(gap); if (gaps.length > 120) gaps.shift();
  if (seen++ % 20 === 0) typical = gaps.slice().sort((a, b) => a - b)[gaps.length >> 1];   // the usual gap: 8.3ms at 120Hz, 16.7ms at 60Hz
  const missed = typical && gap > typical * 1.5 ? Math.round(gap / typical) - 1 : 0;
  let any = false;
  for (const l in live) { if (from < live[l]) { count(l, gap, missed); any = true; } if (t >= live[l]) delete live[l]; }
  if (!any) count("quiet", gap, missed);
}
// The next `ms` belong to `label`. Marking a label that is still playing extends it (and is not a new run).
function mark(label, ms) { const now = performance.now(); if (!(live[label] > now)) stat(label).runs++; live[label] = Math.max(live[label] || 0, now + ms); }
const start = () => { if (!raf && !document.hidden) { last = 0; raf = requestAnimationFrame(tick); } };
const stop = () => { if (raf) cancelAnimationFrame(raf); raf = 0; };
const onVis = () => document.hidden ? stop() : start();
const onScroll = () => mark("scroll", 160);
function report() {
  const hz = typical ? Math.round(1000 / typical) : 0, T = (window.SB && window.SB.trouble) || {};
  const app = navigator.standalone || matchMedia("(display-mode: standalone)").matches ? "home-screen app" : "browser";
  const lines = ["Kiron perf · " + (version || "no saved version") + " · " + app + " · about " + hz + " frames a second" + (hz && hz < 100 ? " (capped: Low Power Mode, or Safari's 60fps setting)" : ""),
    "first quiz list: " + (T.listAt ? T.listAt + "ms" : "not shown yet")];
  Object.keys(stats).sort((a, b) => (a === "quiet") - (b === "quiet") || a.localeCompare(b)).forEach(l => {
    const s = stats[l], all = s.frames + s.dropped; if (!all) return;
    lines.push(l + ": " + (l === "quiet" ? "" : s.runs + " runs, ") + (100 * s.dropped / all).toFixed(1) + "% frames dropped, worst " + Math.round(s.worst) + "ms");
  });
  lines.push("last error: " + (T.last || "none"));
  lines.push("quiz files left out: " + ((T.quizzes || []).map(q => q.file).join(", ") || "none"));
  lines.push(navigator.userAgent);
  return lines.join("\n");
}
const chip = document.createElement("button");
chip.type = "button"; chip.textContent = "perf · copy";
chip.style.cssText = "position:fixed;left:8px;bottom:calc(88px + env(safe-area-inset-bottom,0px));z-index:40;font:600 11px/1 system-ui,sans-serif;padding:9px 11px;border-radius:99px;border:1px solid #444;background:#111;color:#b0aea5;opacity:.85;-webkit-tap-highlight-color:transparent";
// The chip keeps its taps to itself, so a tap on it never counts as a tap on the quiz underneath.
["pointerdown", "pointerup"].forEach(ty => chip.addEventListener(ty, e => e.stopPropagation()));
chip.addEventListener("click", e => {
  e.stopPropagation();
  const text = report(), said = ok => { chip.textContent = ok ? "copied" : "copy failed"; setTimeout(() => { chip.textContent = "perf · copy"; }, 1600); };
  const old = () => { const ta = document.createElement("textarea"); ta.value = text; ta.style.cssText = "position:fixed;left:0;top:0;opacity:0"; document.body.append(ta); ta.select(); let ok = false; try { ok = document.execCommand("copy"); } catch (_) {} ta.remove(); said(ok); };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => said(true), old); else old();
});
function off() { stop(); document.removeEventListener("visibilitychange", onVis); removeEventListener("scroll", onScroll); chip.remove(); delete window.KironPerf; }
try { caches.keys().then(ks => { version = ks.filter(k => /^kiron-/.test(k)).join(", "); }).catch(() => {}); } catch (_) {}
document.addEventListener("visibilitychange", onVis);
addEventListener("scroll", onScroll, { passive: true });
document.body.append(chip);
window.KironPerf = { mark, report, off, stats };
start();
})();
