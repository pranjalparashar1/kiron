/* Kiron: the two hidden screens, "Import a quiz" (#import) and "Make a quiz" (#make).
   app.js fetches this file (and prompt.js) only when one of them is opened, so a normal launch never loads it. */
(function () {
"use strict";
const { $, esc, app, topBar, backBtn, toast, go, eachQ, findQuiz, allQuizzes, getImported, saveImported } = window.SB.ui;
const validateQuiz = window.SB.validateQuiz;

async function copyText(text, fallbackEl) {
  try { await navigator.clipboard.writeText(text); toast("Copied"); return true; }
  catch (e) {
    if (fallbackEl) { const r = document.createRange(); r.selectNodeContents(fallbackEl); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
    toast("Couldn't copy automatically. The text is selected: copy it from the menu.");
    return false;
  }
}

function parseQuizText(raw) {
  let s = String(raw || "").trim();
  if (!s) return { error: "Nothing to import yet. Paste the quiz text the AI gave you, or choose the file." };
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a < 0 || b < a) return { error: "This doesn't look like a quiz. The quiz text starts with { and ends with }. Copy the whole code block the AI gave you." };
  s = s.slice(a, b + 1);
  const attempts = [s, s.replace(/,\s*([}\]])/g, "$1"), s.replace(/[“”]/g, '"').replace(/,\s*([}\]])/g, "$1")];
  let firstErr;
  for (const t of attempts) { try { return { data: JSON.parse(t) }; } catch (e) { if (!firstErr) firstErr = e; } }
  let where = "";
  const m = String(firstErr && firstErr.message).match(/position (\d+)/);
  if (m) { const p = +m[1]; const line = s.slice(0, p).split("\n").length; where = " Around line " + line + ": “" + s.slice(Math.max(0, p - 40), p + 30).replace(/\s+/g, " ") + "”."; }
  return { error: "The quiz text is incomplete or has a typo, so it can't be read." + where + " This usually means it was cut off while copying, or the AI's reply was too long. Copy the code block again, or ask the AI to send the JSON again in full." };
}

/* ---------------- import ---------------- */
function renderImport() {
  document.title = "Import a quiz · Kiron";
  app().innerHTML = topBar(backBtn(), `<h1>Import a quiz</h1>`) + `<main class="wrap">
    <div class="page-h"><h2 tabindex="-1">Add a quiz</h2><p>Paste the quiz text an AI made for you (see <a href="#make">Make a quiz</a>), or one a friend sent you. You can also open a <b>.json</b> quiz file.</p></div>
    <textarea id="imp-text" class="mono" placeholder='Paste here. It starts with {"format": "study-buddy-quiz", …' aria-label="Quiz text"></textarea>
    <div class="row">
      <button class="btn primary" id="imp-go" type="button">Import</button>
      <label class="btn file-btn" for="imp-file">Open a file…<input type="file" id="imp-file" accept=".json,.txt,application/json,text/plain"></label>
    </div>
    <div id="imp-out" aria-live="polite"></div>
    <p class="note">The quiz is stored on this device only. To use it on another phone, share it from the quiz screen.</p>
  </main>`;
  $("#imp-go").onclick = () => doImport($("#imp-text").value);
  $("#imp-file").onchange = e => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    if (f.size > 3e6) { showImportErrors(["That file is too big to be a quiz (over 3 MB)."]); return; }
    const r = new FileReader(); r.onload = () => { $("#imp-text").value = r.result; doImport(r.result); }; r.readAsText(f);
  };
}
function showImportErrors(errs) {
  const shown = errs.slice(0, 12);
  const forAI = "The quiz JSON you gave me has these problems. Please fix them and send the complete corrected JSON in one code block:\n- " + errs.join("\n- ");
  $("#imp-out").innerHTML = `<div class="errors"><b>${errs.length === 1 ? "One thing to fix" : errs.length + " things to fix"}</b><ul>${shown.map(e => `<li>${esc(e)}</li>`).join("")}${errs.length > shown.length ? `<li>…and ${errs.length - shown.length} more.</li>` : ""}</ul>
    <span>Easiest fix: copy these problems back to the AI that made the quiz and ask it to correct them.</span>
    <div><button class="btn small" id="imp-copyerr" type="button">Copy problems for the AI</button></div></div>`;
  $("#imp-copyerr").onclick = () => copyText(forAI);
}
function doImport(raw) {
  const p = parseQuizText(raw);
  if (p.error) return showImportErrors([p.error]);
  const v = validateQuiz(p.data);
  if (v.errors) return showImportErrors(v.errors);
  const quiz = v.quiz;
  const clash = findQuiz(quiz.id);
  let n = 0; eachQ(quiz, () => { n++; });
  $("#imp-out").innerHTML = `<div class="ok-box"><b>Looks good: “${esc(quiz.title)}”</b><span>${n} questions in ${quiz.sections.length} ${quiz.sections.length === 1 ? "part" : "parts"}.</span>
    ${clash ? `<span>You already have a quiz with this name.</span><div class="row"><button class="btn primary" id="imp-replace" type="button">Replace it</button><button class="btn" id="imp-both" type="button">Keep both</button></div>` : `<div class="row"><button class="btn primary" id="imp-save" type="button">Save and open</button></div>`}</div>`;
  const save = asNew => {
    let list = getImported();
    if (asNew) { let k = 2; while (allQuizzes().some(x => x.quiz.id === quiz.id + "-" + k)) k++; quiz.id = quiz.id + "-" + k; quiz.title = quiz.title + " (" + k + ")"; }
    list = list.filter(q => q.id !== quiz.id); list.unshift(quiz);
    if (!saveImported(list)) { showImportErrors(["This device's storage is full or blocked (private browsing?), so the quiz couldn't be saved."]); return; }
    toast("Saved"); go("quiz-" + quiz.id, true);
  };
  if ($("#imp-save")) $("#imp-save").onclick = () => save(false);
  if ($("#imp-replace")) $("#imp-replace").onclick = () => save(false);
  if ($("#imp-both")) $("#imp-both").onclick = () => save(true);
}

/* ---------------- make a quiz (prompt) ---------------- */
function renderMake() {
  document.title = "Make a quiz · Kiron";
  const prompt = window.SB_PROMPT || "";
  app().innerHTML = topBar(backBtn(), `<h1>Make a quiz</h1>`) + `<main class="wrap">
    <div class="page-h"><h2 tabindex="-1">Turn your notes into a quiz</h2><p>Kiron has no AI of its own. Any AI chat can write the quiz for you, and this prompt tells it exactly how. About two minutes.</p></div>
    <ol class="steps">
      <li><div><b>Copy the prompt</b><span>The button below copies it.</span></div></li>
      <li><div><b>Open ChatGPT, Claude or Gemini</b><span>The free version is fine. Paste the prompt and attach your PDF, slides or Word file.</span></div></li>
      <li><div><b>Answer its two questions</b><span>What you're reading it for, and how long a quiz you want.</span></div></li>
      <li><div><b>Copy the code block it gives back</b><span>All of it, from the first { to the last }.</span></div></li>
      <li><div><b>Import it here</b><span>Tap <b>Import a quiz</b> and paste. If something's off, Kiron tells you what to ask the AI to fix.</span></div></li>
    </ol>
    <div class="row"><button class="btn primary" id="mk-copy" type="button">Copy the prompt</button><button class="btn" data-go="import" type="button">Import a quiz</button></div>
    <details class="how"><summary>Read the prompt</summary><pre class="prompt-text" id="mk-text">${esc(prompt)}</pre></details>
    <p class="note">Big file? Upload a chapter at a time and make one quiz per part.</p>
  </main>`;
  $("#mk-copy").onclick = () => { document.querySelector("details.how").open = true; copyText(prompt, $("#mk-text")); };
}

window.KironExtra = { import: renderImport, make: renderMake };
})();
