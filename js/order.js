/* Kiron: putting a list in order by hand (drag a row, or the saved tap-to-order). The app hands in the quiz in play
   and how to save it (hooks), and registers the four handlers below in its own event order. */
import { reduceMotion, buzz, GHOST } from "./ui.js";
import { EASE } from "./fx.js";

const hooks = { cur: () => null, save: () => {} };
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
  const current = hooks.cur();
  if (save && current && current.P.cur && !current.P.cur.done) { const P = current.P, id = P.cur.id; P.a[id] = kids.map(li => +li.dataset.it); (P.k = P.k || {})[id] = k; hooks.save(); }
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
function onOrderClick(e) {
  const li = TAP_ORDER && e.target.closest && e.target.closest(".order:not(.done) li"); if (!li || !hooks.cur()) return;
  if (e.target.classList.contains("hx")) buzz(10);
  tapRow(li);
}
function onOrderKey(e) {
  const li = e.target.closest && e.target.closest(".order:not(.done) li"); if (!li || !hooks.cur()) return;
  if (TAP_ORDER) { if (e.key !== "Enter" && e.key !== " ") return; e.preventDefault(); tapRow(li); }
  else { const d = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0; if (!d) return; e.preventDefault(); endDrag(); const ol = li.parentElement; if (moveLi(ol, li, [...ol.children].indexOf(li) + d)) syncOrder(ol, ol.children.length, true); }
  li.focus({ preventScroll: true });
}
function onOrderMenu(e) { if (e.target.closest && e.target.closest(".order li")) e.preventDefault(); }
// Drag (now): a finger on a row lifts it at once. Tap-to-order (saved): a finger resting on a row lifts it after a moment,
// and moving first means a scroll (or a tap that slipped).
const HOLD_MS = 180, HOLD_SLOP = 8;
function onOrderDown(e) {
  const li = e.target.closest && e.target.closest(".order:not(.done) li"); if (!li || !hooks.cur() || e.button > 0) return;
  endDrag();
  const pid = e.pointerId, mouse = e.pointerType === "mouse", x0 = e.clientX, y0 = e.clientY; let y = y0, timer = 0;
  const stop = () => { clearTimeout(timer); HOLD = null; window.removeEventListener("pointermove", mv, true); window.removeEventListener("pointerup", stop, true); window.removeEventListener("pointercancel", stop, true); };
  const lift = () => { stop(); if (li.isConnected && !li.parentElement.classList.contains("done")) startDrag(li, pid, mouse ? y0 : y, y, mouse); };
  const mv = ev => { if (ev.pointerId !== pid) return; y = ev.clientY; if (Math.hypot(ev.clientX - x0, y - y0) > (mouse ? 4 : HOLD_SLOP)) mouse ? lift() : stop(); };
  window.addEventListener("pointermove", mv, true); window.addEventListener("pointerup", stop, true); window.addEventListener("pointercancel", stop, true);
  HOLD = { stop };
  if (!mouse) { if (TAP_ORDER) timer = setTimeout(lift, HOLD_MS); else lift(); }   // with a mouse, moving is the lift
}
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
    if (carried && mouse) GHOST.until = Date.now() + 350;   // a mouse sends a click after the drop: it is not a tap
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

export { hooks, TAP_ORDER, dragging, endDrag, placedOf, onOrderClick, onOrderKey, onOrderMenu, onOrderDown };
