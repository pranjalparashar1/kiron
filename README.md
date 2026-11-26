# Kiron

Kiron is named after Chiron, the teacher. One question per screen, short rounds of seven, tap to answer. Built for phones.

Everything runs in the browser. Progress stays on your device.

- Add a quiz for everyone: see [QUIZ_FORMAT.md](QUIZ_FORMAT.md).
- Changing how the app looks or moves: read [DESIGN.md](DESIGN.md) first.
- Tests: `node --test tests/*.test.js` (no install needed). They check every quiz file loads, rounds stay kind about numbers questions, and quiz text can't inject markup. They run on every pull request.
