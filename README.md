# Kiron

Kiron is named after Chiron, the teacher. One question per screen, short rounds of seven, tap to answer. Built for phones.

Everything runs in the browser. Progress stays on your device.

Questions you have answered come back when you are about to forget them: a **Today** card tops the list while any are due, from every quiz. When is worked out by FSRS-7 from how each answer went, so there is nothing to rate.

- Make a quiz from anything you read: tap **Build your own** in the app. It gives your AI app (ChatGPT, Claude, Gemini) the prompt, then brings the quiz back.
- Add a quiz for everyone: see [QUIZ_FORMAT.md](QUIZ_FORMAT.md).
- Changing how the app looks or moves: read [DESIGN.md](DESIGN.md) first.
- The code: plain native ES modules in `js/`, no build step. `js/app.js` is the app (router, screens, player); next to it are `store.js` (what the phone keeps), `validate.js` (reading quiz files), `round.js` (making and marking rounds), `maths.js`, `fx.js` (effects), `order.js` (putting a list in order), `fsrs7.js` (spaced recall and the Today round), and `build.js` with `parser.js` and `prompt.js` (Build your own, loaded only when it's opened).
- Tests: `node --test tests/*.test.js` (no install needed). They check every quiz file loads, rounds stay kind about numbers questions, and quiz text can't inject markup. They run on every pull request.
