/* Kiron 1.7: "Build your own" (#build). Anyone turns what they read into a Kiron quiz with their own AI app, no
   account and no server: give the AI Kiron's prompt, bring back what it makes. Two steps, phone-native:
   1. Share the prompt (the iPhone's share sheet goes straight to ChatGPT, Claude or Gemini; Copy where there is none).
   2. Paste the quiz (the iPhone's own Paste bubble), or open the .md file the AI made.
   The quiz is saved on this device and opens at once. app.js fetches this file, parser.js and prompt.js only when the
   screen is opened, so a normal launch never loads them. */
(function () {
"use strict";
const { $, esc, app, topBar, backBtn, toast, go, findQuiz, allQuizzes, getImported, saveImported } = window.SB.ui;
const { validateQuiz } = window.SB;
const { readQuiz } = window.KironParse;
const PROMPT = window.SB_PROMPT || "";

async function copy(text, done) {
  try { await navigator.clipboard.writeText(text); toast(done); return true; }
  catch (e) { toast("Couldn't copy here. Try again in Safari."); return false; }
}

// Share where the phone can (the AI apps sit in the share sheet); copy where it can't. Cancelling the sheet is fine.
async function sharePrompt() {
  if (navigator.share) {
    try { await navigator.share({ text: PROMPT }); return; }
    catch (e) { if (e && e.name === "AbortError") return; }
  }
  copy(PROMPT, "Prompt copied");
}

function render() {
  document.title = "Build your own · Kiron";
  const canShare = !!navigator.share;
  app().innerHTML = topBar(backBtn(), `<span class="grow"></span>`) + `<main class="wrap build">
    <h1 class="pick">Build your own</h1>
    <ol class="steps">
      <li><div><b>Give your AI the Kiron prompt</b><span>Attach what you read.</span>
        <button class="btn primary" id="b-share" type="button">${canShare ? "Share prompt" : "Copy prompt"}</button></div></li>
      <li><div><b>Bring the quiz back</b>
        <button class="btn primary" id="b-paste" type="button">Paste quiz</button>
        <label class="btn ghost file-btn" for="b-file">Open a file<input type="file" id="b-file" accept=".md,.markdown,.txt,.json,text/markdown,text/plain,application/json"></label></div></li>
    </ol>
    <div id="b-out" aria-live="polite"></div>
  </main>`;
  $("#b-share").onclick = sharePrompt;
  $("#b-paste").onclick = paste;
  $("#b-file").onchange = e => {
    const f = e.target.files && e.target.files[0]; e.target.value = ""; if (!f) return;
    if (f.size > 3e6) return trouble(["That file is too big to be a quiz."]);
    const r = new FileReader(); r.onload = () => bring(r.result); r.onerror = () => trouble(["That file couldn't be opened. Try saving it again."]); r.readAsText(f);
  };
}

// The iPhone asks with its own small Paste bubble. Where reading the clipboard isn't allowed, a box to paste into.
async function paste() {
  let text = null;
  try { if (navigator.clipboard && navigator.clipboard.readText) text = await navigator.clipboard.readText(); } catch (e) {}
  if (text == null) return pasteBox();
  bring(text);
}
function pasteBox() {
  $("#b-out").innerHTML = `<div class="paste-box"><textarea id="b-text" class="mono" aria-label="Quiz text" placeholder="Paste the quiz here"></textarea>
    <button class="btn primary" id="b-go" type="button">Bring it in</button></div>`;
  $("#b-go").onclick = () => bring($("#b-text").value);
  $("#b-text").focus();
}

// Kind and short. The full list goes to the AI, which can fix it in one go.
function trouble(errs) {
  const note = "Kiron couldn't read the quiz you made. Please fix these and send the whole quiz again, in the same format:\n- " + errs.join("\n- ");
  $("#b-out").innerHTML = `<div class="notice"><p>${esc(errs[0])}${errs.length > 1 ? " And a few more small things." : ""}</p>
    <button class="btn" id="b-note" type="button">Copy a note for your AI</button></div>`;
  $("#b-note").onclick = () => copy(note, "Note copied");
}

function bring(raw) {
  const p = readQuiz(raw);
  if (p.error) return trouble([p.error]);
  const v = validateQuiz(p.data);
  if (v.errors) return trouble(v.errors);
  const quiz = v.quiz;
  // The same quiz brought in again replaces the old copy (progress follows each question). A clash with a quiz that
  // comes with the app keeps both.
  const clash = findQuiz(quiz.id);
  if (clash && !clash.mine) { let k = 2; while (allQuizzes().some(x => x.quiz.id === quiz.id + "-" + k)) k++; quiz.id += "-" + k; }
  const list = getImported().filter(q => q.id !== quiz.id);
  list.unshift(quiz);
  if (!saveImported(list)) return trouble(["This phone's storage is full or switched off (private browsing?), so the quiz couldn't be saved."]);
  toast("Quiz ready");
  go("quiz-" + quiz.id, true);
}

window.KironExtra = { build: render };
})();
