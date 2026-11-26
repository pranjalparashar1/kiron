/* Kiron: small page helpers every screen uses (find, escape, toast, top bar, haptic switches). */
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
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
const app = () => $("#app");
const topBar = (left, title, right) => `<header class="top"><div class="top-in">${left || ""}${title}${right || ""}</div></header>`;
const backBtn = (to, label) => `<button class="icon-btn" data-go="${to || ""}" aria-label="${label || "Back to library"}" type="button">←</button>`;
/* ---- Kiron 1.4.4: haptics. A web page on an iPhone cannot ask for a vibration, but the phone itself gives a tick when a
   finger flips a real iOS switch. So each button carries an invisible switch stretched over it: the finger lands on the
   switch, the phone ticks, and the tap carries on to the button as always. Where there is no tick (older phones, laptops)
   nothing else changes. Kept off the long scrolling lists (the quiz cards and the part rows under "Jump to a part"): a finger
   that lands on a switch and drags may move the switch instead of the page. A part's own buttons (Start, Review, Redo) keep it. Also kept off anything that cannot be pressed.
   Android phones have a real vibration call, so they get a short buzz, a double one for a right answer and one when a streak lands. ---- */
const HX = `<input class="hx" type="checkbox" switch tabindex="-1" aria-hidden="true">`;
const hxAll = html => html.replace(/<button\b([^>]*)>([\s\S]*?)<\/button>/g, (m, at, inner) => /qcard|part-row|aria-disabled="true"|\sdisabled\b/.test(at) ? m : `<button${at}>${inner}${HX}</button>`);
const buzz = p => { if (navigator.vibrate) try { navigator.vibrate(p); } catch (e) {} };
const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
// The browser sends a click after some taps (an edge tap, a drop, a tap that only put a bubble away). Until this time,
// clicks are swallowed so they can't land on the next screen. Shared, so any part of the app can set it.
const GHOST = { until: 0 };

export { $, esc, toast, toastHeld, app, topBar, backBtn, HX, hxAll, buzz, reduceMotion, GHOST };
