# Kiron design system

How Kiron looks, moves and behaves, taken from the code (`styles.css` and the modules in `js/`; it was `app.js` until 1.6.4) on main at PR #52 (service worker `kiron-v57`). Where this file and the code disagree, the code wins. Update this file in the same PR as any change to the look.

Kiron is a phone-first quiz player: one question per screen, rounds of 7, tap to answer. Everything below serves one aim: keep someone reading and tapping on a phone, with as little in the way as possible.

---

## 1. Principles (apply these first)

1. **Native first.** Use what iOS and Safari already do before building anything: native smooth scroll (`scrollTo({behavior:"smooth"})`), the system haptic tick from a real `<input type="checkbox" switch>`, `<details>` for "Full answer", system focus and reduced-motion settings. Add as few custom layers on top as possible.
2. **Ruthlessly minimal text.** No intro copy, no subtitles, no labels that repeat what a control shows. The library is a title and a list of quizzes. A quiz home is the title and one big button.
3. **Phone only.** Design for an iPhone held in one hand. Laptops only have to work (max content width 560px). Every touch target is at least 44px.
4. **No intimidating numbers.** No question counts, no "3 of 7", no percentages, no scores. Progress is the story bar (segments, no numbers). The round end shows a right/wrong bar with ✓ and ✕, not numbers. The only number on screen is the streak count, because it is a reward.
5. **Kind feedback, never failure language.** Wrong is "to revisit" or "Revisit", never "wrong", "failed" or "incorrect" in copy. A timed-out question is "left for later", never marked wrong. No verdict banner after an answer: just the colours and the one-line why.
6. **Every question has a hint.**
7. **Smooth beats rich.** If an effect cannot run on the GPU (transform and opacity), it does not ship. See Motion.

---

## 2. Colour tokens

Always dark. True black page (an OLED iPhone switches black pixels off). No light mode. `color-scheme: dark`. `theme-color` and manifest background are `#000000`.

```css
:root {
  /* layers: page, card, raised (panel on a card), hairline */
  --bg: #000; --surface: #10100f; --surface2: #1a1a18; --line: #272725;
  /* text */
  --ink: #faf9f5; --muted: #b0aea5;
  /* accent: orange (actions, primary buttons, links, drag) */
  --accent: #d97757; --accent-ink: #141413; --accent-soft: #33241d;
  /* blue: calm and informational (hints, pause, selection, focus ring, open dropdown edge) */
  --blue: #6a9bcc; --blue-soft: rgba(106,155,204,.14);
  /* right (off-brand on purpose) */
  --ok: #34c759; --ok-ink: #06210f; --ok-soft: #12301b;
  /* not yet (off-brand on purpose) */
  --no: #ff5a4f; --no-ink: #ffe1de; --no-soft: #4a1517;
  --font: "Poppins", -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
  --code: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  --r: 12px; --w: 560px;
  color-scheme: dark;
}
/* On P3 screens the same colours are given in P3 so they reach the screen's full strength */
@supports (color: color(display-p3 1 1 1)) { @media (color-gamut: p3) {
  :root { --accent: color(display-p3 0.851 0.467 0.341); --blue: color(display-p3 0.416 0.608 0.8);
          --ok: color(display-p3 0.204 0.78 0.349); --no: color(display-p3 1 0.353 0.31); }
} }
```

Rules:
- Resting layers are only ever greys stepping up from black (`--bg` → `--surface` → `--surface2`, edged by `--line`). **Colour is for state only** (picked, right, not yet, streak), never for a resting surface.
- Orange = "do this" (primary button, links, the "Full answer" summary, a drag in progress, the Next pulse ring). Text on orange is `--accent-ink`.
- Blue = "information" (hint box and label, pause when on, a selected multi-select option, focus ring, open dropdown border at `rgba(106,155,204,.55)`, card chevrons, tapped card border).
- Green and red are deliberately off the orange/blue palette so right and wrong can never be confused with brand colour.
- Other one-off values in the code: primary XL button shadow `#8f4630`; round-end red stripes `#e0453b` / `#b8352d`; confetti `#d97757 #faf9f5 #6a9bcc #788c5d #e3b04b`.

---

## 3. Type

**Poppins only**, self-hosted woff2 (400, 400 italic, 500, 600, 700, 800), `font-display: swap`, 500 and 800 preloaded. No serif anywhere (a serif was tried and rejected as hard to read on a phone). Lining numerals (`font-variant-numeric: lining-nums`), tabular numerals on the streak count.

| Use | Size / line-height | Weight | Notes |
|---|---|---|---|
| Body default | 17px / 1.55 | 500 | |
| Read-through text (explanation, hint, full answer) | as set | 400 | `letter-spacing: .005em` |
| Question prompt | 26px / 1.28 | 800 | `-.015em`, `text-wrap: pretty`; over 150 chars → 21px / 1.35 |
| Quiz title (home) | 26px / 1.2 | 800 | centred, `-.02em`, balanced |
| Library heading "Pick your quiz" | 30px / 1.15 | 700 | `-.02em` |
| Round end heading | 30px | 800 | `-.02em` |
| Quiz card title | 18px / 1.3 | 600 | balanced |
| Brand "Kiron" | 19px | 700 | `-.01em`, 28px icon, radius 7px |
| Top bar h1 | 18px / 1.25 | (inherit) | one line, ellipsis |
| Option | 16.5px / 1.4 | 500 | right answer → 700 |
| Explanation (`.model`) | 17px / 1.6 | 400 | |
| Hint | 16px | 400 | label "HINT": 12px, uppercase, `.07em`, blue |
| Buttons | 16px (bar 17-18px, XL 21px) | primary 700 | |
| Streak count | 20px | 800 | tabular numerals, in heat colour with glow |
| Small / notes | 14-15px | | `--muted` |

---

## 4. Spacing, radii, layout

- Page column: `max-width: 560px`, centred, side padding `max(16px, safe-area-inset)`. Vertical gap between blocks 16px (home 22px, library 18px). Bottom padding 96px; on the player `110px + safe-area` so nothing hides under the action bar.
- Safe areas: body pads top and bottom with `env(safe-area-inset-*)`; a fixed black strip covers the status-bar area.
- Heights use `100svh` (not `vh`) so Safari's sliding toolbar never re-lays out the page mid-scroll.
- Gaps: options 8px, ordering rows 6px, part rows 6px, buttons in a row 10px, cards 12px.
- Radii: `--r` 12px (cards, part rows, ordering rows); options 14px; buttons 12px (small 10px, XL 16px, action-bar primary 14px); icon buttons 10px (pause 9px); hint and explanation 10px; dropdown boxes 14px; pills and bars 99px.
- Touch targets: minimum 44px. Buttons 48px, action bar 54px, XL 68px, options 58px, part rows 54px, dropdown heads 56px. The small pause (34px) keeps a full-size invisible touch area around it.
- No visible scrollbars anywhere (scrolling still works). No rubber-band bounce on the quiz screen (`overscroll-behavior-y: none`).

---

## 5. Components

### Buttons
- `.btn`: surface background, 1px `--line` border, radius 12, min-height 48.
- `.btn.primary`: orange fill, `--accent-ink` text, 700.
- `.btn.xl`: the one big action on a screen (Start / Continue / Keep going). 68px, 21px 700, radius 16, a solid 5px `#8f4630` "lip" shadow that presses down 3px on `:active`.
- `.btn.ghost`: transparent; `.btn.danger`: red text, faint red border (Reset, Delete).
- `.icon-btn`: 44×44, radius 10 (✕ leave, ← back, pause). Pressed: `scale(.9)` instantly, springs back on release.
- Destructive actions use **tap twice**: the label changes to "Tap again to reset" / "Tap again to delete" / "Tap again to redo" for 4 seconds. No modal dialogs.
- Every pressable button carries the invisible haptic switch (see Interaction).

### Library
Top bar with the brand only. "Pick your quiz", then cards: quizzes you built yourself first, then the test quizzes. Every other quiz is folded under one "All quizzes" dropdown. Last comes a "Build your own" card (same card, an orange `+` instead of `›`, an orange border when pressed), then a faint credit line at the foot (12.5px, muted, 55% opacity). Quiz card: surface, 1px line, radius 12, min-height 76, title left and a blue `›` right; pressed = `scale(.98)` + blue border. Quizzes sorted A-Z. No counts, no descriptions.

### Build your own (`#build`)
Back button, heading "Build your own" (library heading style), and two numbered steps (orange 34px circles):
1. **Give your AI the Kiron prompt**, a muted "Attach what you read.", and a full-width primary **Share prompt**. It opens the iPhone share sheet, where the AI apps are. It reads **Copy prompt** where sharing isn't possible.
2. **Bring the quiz back**, a full-width primary **Paste quiz** (the iPhone's own Paste bubble asks first), and a quiet ghost **Open a file** (.md, .txt, .json).

If the clipboard can't be read, a paste box and "Bring it in" appear under the steps. If the quiz can't be read, a calm grey box (surface2, never red) shows one sentence and **Copy a note for your AI**, which copies every problem for the AI to fix. A quiz that reads well is saved and opens straight on its quiz home with the toast "Quiz ready". Bringing the same quiz in again replaces it, and its progress carries over. The old `#import` and `#make` lead here.

### Quiz home
Back button, the quiz title (centred, 9vh from the top), one XL primary button (Start / Continue / Do the ones you left / Revisit what you missed), an optional secondary "Revisit what you missed", a "Jump to a part" dropdown, and "Reset quiz" at the foot. When everything is done: a quiet green box "End of quiz."

### Dropdowns (Jump to a part, All quizzes, each part)
One box in three pieces: head, list (`.unfurl > .fold > .fold-in`) and cap (the rounded bottom edge). It opens and shuts by **transform only** (520ms, `cubic-bezier(.32,.72,0,1)`): the cap slides, the list's window slides one way while the list slides the other, so the list stands still and is uncovered. Everything below rides with the cap. Caret rotates 180°. Open border turns blue. One part open at a time. A part row: a status dot (empty ring = not started, blue = in progress, green = done) and a short word ("Not started", "In progress", "Done"), then Start / Continue / Review / Redo inside.

### Player top bar
✕ (leave) · story bar · streak count (when 3+) · pause.

**Story bar = progress + timer.** 7 segments, 5px tall, 4px gaps, pill ends. Past = ink (or streak colour); left for later = muted at 40%; current = fills left to right as the timer (`transform: scaleX`, linear). No numbers. Its accessible label carries "Question N of 7" for screen readers only.

**Timer.** Always plays; pause holds only the current question, the next one plays again. Length = 12s + 0.35s per word of prompt and options, clamped 20-60s, ×1.5 for multi-select and ordering. When it fills, the question is **left for later** (not marked wrong). Pauses when the app is hidden. Pause button: 34px, blue fill when paused, play/pause icons; once answered it goes invisible but keeps its space so the bar does not move.

### Question
Prompt (26px/800). Optional small "Numbers" tag (blue pill) on number questions (typed `number` questions and any question tagged `calc`). For setup questions an orange line: "No calculating. Pick the setup that gives the answer." Multi-select adds a muted "Pick all that apply."

### Options (the core component)
- Resting: surface, 2px `--line` border, radius 14, min-height 58, 12×14 padding. Order shuffled (kept fixed when options say "all/none/both of" or "above").
- Pressed: `scale(.985)` + orange border.
- **Right (your pick):** solid `--ok` green fill and border, dark green text, 700, a round dark badge with ✓. Pops (`scale .96 → 1.04 → 1`, 450ms springy). A white light grows from the tap point (bloom), and 16 confetti pieces burst.
- **Your wrong pick:** `--no-soft` red tint, 2px `--no` red border, light red text, a red round badge with ✕. It settles softly (`scale .96` and back, 450ms), **no shake**. The right option rises gently into place at the same time and shows green with ✓.
- **Right but not picked (multi-select):** quieter green (`--ok-soft` fill, green border, green ✓ outline badge).
- **The rest, once answered:** stay where they were, faded to 50% and compact (min-height 40, 14px text, 1px border). They take the compact size in one step; only the fade animates. Kept visible on purpose so a mis-tap is easy to spot.
- Selected (multi-select, before Check): blue border on blue tint, square blue badge with ✓.
- Answered questions are locked.

### Ordering
Rows of the whole item, each a control. Drag to reorder: a touch on a row lifts it at once; the others slide aside by transform. A held row has an orange border on `--accent-soft` and no shadow. After Check: right rows green with ✓, wrong rows red tint + red border with ✕, then "Right order: 1. … · 2. …" in muted text.

### Hint
A "💡 Hint" ghost button sits small in the action bar. Tapped: a blue-tint box **under the options** (so options never jump) with a blue uppercase "HINT" label, fades in from 4px above (250ms), and the page glides just enough to show it. Hidden once the question is answered.

### Explanation
No verdict text. After the pick has popped, the one-line why (`.model`, `--surface2`, radius 10, 17px/1.6, weight 400) fades up from 12px below (420ms) and the page glides once so it sits above the action bar without pushing your pick off the top. Optional "Full answer" is a native `<details>` with an orange summary; opening it glides it into view.

### Action bar
Fixed to the bottom, surface background, hairline top, safe-area padding. Before answering: ‹ back (if not first), 💡 Hint, Check (multi/order only; faded to 40% until ordering is complete). After answering: ‹ back and a full-width orange **Next** (Finish / Done on the last). Next pulses gently (`scale 1.035`, 1.15s) with an orange ring that grows and fades, forever, as a layer (not a repainted shadow). With reduced motion: a static orange outline instead.

### Streak (rewards a run of right answers)
Count appears at 3 in a row, at the end of the story bar: flame (or star) + number in the heat colour. The bar, flame and count all take the stage colour. A wrong answer or leaving resets it. Carrying straight on from a round keeps it.

| Stage | At | `--heat` | Look |
|---|---|---|---|
| 1 amber | 3 | `#f0b23a` | flame |
| 2 gold | 5 | `#ffcf3f` | flame |
| 3 pale gold | 8 | `#ffe9a3` | flame + rising embers |
| 4 white-hot | 11 | `#ffffff` | flame with blue-white glow, faster flicker |
| 5 black fire | 15 | `#0b0b0b` | black flame and number with orange `#ff6a2b` edge and violet glow; bar shimmer |
| 6 nebula | 20 | `#9b7bff` | violet/magenta/teal clouds drift behind the bar; gradient flame |
| 7 constellation | 25 | `#dfe7ff` | flame becomes a star; stars appear and join with fine lines |
| 8 galaxy | 30 | `#fff1c9` | ringed star with orbiting moon, clouds + constellation, gold-white shimmer |

The bar stays **one solid colour** at every stage (no gradients on the bar). Full per-stage `--glow`, `--glow2`, `--f1`, `--f2` values are in `styles.css` under `[data-heat="N"]`.

**Streak reward** (each right answer from 3): starts 420ms after the answer (after the pop and confetti). A pill (flame icon + "N in a row") (filled in the stage colour) springs up at top centre (560ms), swells slowly while you read (~720ms), then flies in **one accelerating arc** (290ms) into the count with a short comet tail, and lands: the count, flame and bar kick, a flash, two rings, sparks and one light sweeping back along the bar. Effects grow a little with each stage. A new stage adds a bigger pop.

**The fire answers a touch.** Tap: a small bubble explains it ("Hold the fire for a surprise", later "Hold to burn a wrong option"). Hold ~1s: it swells, trembles, pops, and a fireball burns away one wrong option; that costs one from the streak. The next tap anywhere only dismisses a bubble.

### Round end
Heading "Round done" (or "End of quiz."). A 30px pill bar: green fill (with ✓) over red striped fill (with ✕), no numbers; it slides from last round's split to this one (1.2s). The best run pill: flame + "**N** in a row", plus orange "longest yet" when it beats this quiz's record (springs in). Then "Keep going" (XL primary) and/or "Revisit". Top bar keeps ✕ and a "Done" button.

### Toast
Bottom centre, ink background with black text (inverted), radius 10, 15px, 2.6s. A tap-to-act toast stays until tapped (used for "Something went off. Tap to reload."). Copy is plain and kind: "Nothing left there. Nice.", "Your progress can't be saved on this phone right now."

### Reset
The Reset button folds away (`scale .16, .9` + fade, 260ms) and a green round tick grows in its place; the tick is "drawn" by two opposite sliding windows, not a stroke animation.

---

## 6. Motion rules

These are hard rules. They come from testing on a 120Hz iPhone, where only compositor work stays smooth.

1. **Animate `transform` and `opacity` only.** Never animate width, height, margin, padding, border-radius, box-shadow, background-position, stroke-dashoffset or any filter. Never put a filter, blur or shadow on something that moves (draw glows once as static shadows or radial gradients).
2. **CSS animations/transitions or Web Animations (WAAPI) only.** No requestAnimationFrame loops, no JS frame-by-frame motion, no JS scroll.
3. **One motion = one animation with one curve.** Never chain eased keyframes along a path (speed drops to zero at each one and it visibly stops). For an arc, nest two wrappers: one moves X, the other Y, on different curves.
4. **Nothing re-renders during an animation.** Layout changes happen in one step before or after; the motion covers the change with a transform (e.g. the bar resizes, then eases from its old width with `scaleX`). Effect layers are built once, kept hidden, and reused (confetti, the streak layer, bloom, edge glow). Patch the DOM in place rather than rebuilding while things animate.
5. **Never retime existing animations, and never go faster.** Motion is unhurried on purpose. Changes ship one at a time and are judged by feel on the phone.
6. **One heavy thing at a time.** Stagger: pick pop → explanation fade + glide → streak reward.
7. **Decorative loops pause while the page scrolls** (flame, sky, glint, Next pulse). The timer never pauses for scroll.
8. **Respect `prefers-reduced-motion`.** Loops off, pops off, the streak pill just fades, scrolls jump.
9. `will-change` only on things that are moving, and only while they move (the streak layer sets it only while running).

Curves and lengths in use (reuse these rather than inventing new ones):

| Name | Value | Used for |
|---|---|---|
| Fold | 520ms `cubic-bezier(.32,.72,0,1)` | dropdowns, caret, title glide |
| Soft settle | `cubic-bezier(.25,.6,.3,1)` 320-480ms | explanation fade, wrong settle, bloom light, screen fade-up (380ms) |
| Springy pop | `cubic-bezier(.3,1.6,.5,1)` 340-450ms | right pick pop, button spring back |
| Slide in | 340ms `cubic-bezier(.22,.8,.24,1)` | next/previous question (24px + fade), round-end bar (1.2s) |
| Spring (`linear()`) | generated damped spring, fallback `cubic-bezier(.34,1.45,.64,1)` | streak pill appear, fire tip, dropped rows |
| Out | `cubic-bezier(.16,.8,.3,1)` | rings, flashes, sparks |
| Drag | 260ms `cubic-bezier(.2,.8,.2,1)` | rows making room |
| Fades | `.25-.35s ease` | hint, faded options, streak count |

---

## 7. Interaction rules

- **Tap only.** No typing to answer, no swipe navigation.
- **Story-style side taps:** only the outer quarter of the screen on each side navigates (left = back, right = next, or "leave for later" if unanswered). The middle half does nothing. Taps on options, the ordering list, the hint, bars and buttons never navigate. A tapped edge lights faintly for 420ms. Movement over 10px or a press over 450ms is not a tap. The browser's follow-up click is swallowed so it cannot hit the next screen.
- **Answered = locked.** Back shows it again, answered.
- **Haptics:** an invisible real iOS switch (`<input type="checkbox" switch>`, opacity 0, never `appearance: none`) stretched over each button, so the phone gives its own tick on tap. Kept off long scrolling lists (quiz cards, part rows) so a drag still scrolls. Android gets a short `navigator.vibrate` instead.
- **Press feedback on everything tappable,** instant on `:active` (no transition, because the finger may be scrolling). The spring back plays only on a finished tap.
- **Scrolling** is always native smooth scroll, never past the end of the page, keeping the thing you just tapped in view.
- **No modals.** Two-tap confirm for anything destructive.
- **Progress saves after every answer** (localStorage, per device). A new app version never reloads the page under someone mid-round.
- **Keyboard (laptops):** ← →, 1-9 picks an option, Enter for Check/Next, H hint, P pause. Focus ring is a 3px blue outline.

---

## 8. Copy

- Short, plain, warm. Sentence case. One line wherever possible.
- Words in use: "Pick your quiz", "Start", "Continue", "Keep going", "Revisit", "Revisit what you missed", "Do the ones you left", "Round done", "End of quiz.", "Jump to a part", "All quizzes", "Hint", "Check", "Next", "Finish", "Done", "Full answer", "N in a row", "longest yet", "Build your own", "Share prompt", "Paste quiz", "Open a file", "Quiz ready".
- Never: wrong, failed, incorrect, score, %, "N of M", "X questions left".
- Quiz content: prompts under 25 words; 4 options of similar length, wrong ones from real confusions; one-line why under 30 words; every question has a hint. Full format in `QUIZ_FORMAT.md`.

---

## 9. Checklist for any change

- [ ] Uses existing tokens; colour only for state.
- [ ] Poppins only; no new font.
- [ ] No new counts, numbers or text that could be cut.
- [ ] Only transform/opacity animate; one curve per motion; nothing re-renders during it; no filters on moving things.
- [ ] Existing animation timings untouched.
- [ ] Works with reduced motion.
- [ ] 44px touch targets; native behaviour used where iOS offers it.
- [ ] Bump `VERSION` in `sw.js` when app files change.
