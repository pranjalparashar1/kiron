# Kiron

Kiron is named after Chiron, the teacher. One question per screen, short rounds of seven, tap to answer. Built for phones.

Everything runs in the browser. Progress stays on your device.

- Add a quiz for everyone: see [QUIZ_FORMAT.md](QUIZ_FORMAT.md).
- Changing how the app looks or moves: read [DESIGN.md](DESIGN.md) first.
- The code: plain native ES modules in `js/`, no build step. `js/app.js` is the app (router, screens, player); next to it are `store.js` (what the phone keeps), `validate.js` (reading quiz files), `round.js` (making and marking rounds), `maths.js`, `fx.js` (effects) and `order.js` (putting a list in order).
- Tests: `node --test tests/*.test.js` (no install needed). They check every quiz file loads, rounds stay kind about numbers questions, and quiz text can't inject markup. They run on every pull request.
