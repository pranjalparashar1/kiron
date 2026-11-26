/* Kiron: find the quiz in whatever came back from an AI chat (a .md file, a whole pasted reply, a .json file) and read it.
   AI apps wrap the quiz in chatter and code fences, curl the quotes, leave trailing commas, write TeX with single
   backslashes and break lines inside strings. Each of those is mended here, quietly. The result is the plain quiz
   object; validate.js then checks what it says. Loaded only on the "Build your own" screen. */
const START = /<!--\s*KIRON-QUIZ-START\s*-->/i, END = /<!--\s*KIRON-QUIZ-END\s*-->/i;

// Every balanced { ... } at the top level, read as JSON would read it (braces inside strings don't count).
function objects(s) {
  const out = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== "{") continue;
    let depth = 0, inStr = false, j = i;
    for (; j < s.length; j++) {
      const c = s[j];
      if (inStr) { if (c === "\\") j++; else if (c === '"') inStr = false; continue; }
      if (c === '"') inStr = true;
      else if (c === "{") depth++;
      else if (c === "}" && !--depth) break;
    }
    if (j >= s.length) { out.push({ text: s.slice(i), cut: true }); break; }   // never closes: cut off while copying
    out.push({ text: s.slice(i, j + 1) });
    i = j;
  }
  return out;
}

// Mend what AI apps get wrong. Only used when the text doesn't read as JSON as it is.
function mend(t) {
  // Quotes curled by the app, where they are clearly JSON's own (next to { } [ ] : ,), become straight again.
  t = t.replace(/([{[,:]\s*)[“”„]/g, '$1"').replace(/[“”„](\s*[:,}\]])/g, '"$1');
  let out = "", inStr = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (!inStr) {
      if (c === '"') inStr = true;
      // a comma right before } or ] is left over from a list that was cut short
      if (c === ",") { let k = i + 1; while (k < t.length && /\s/.test(t[k])) k++; if (t[k] === "}" || t[k] === "]") continue; }
      out += c; continue;
    }
    if (c === "\\") {
      const n = t[i + 1];
      // \( \frac \sqrt written with one backslash: JSON only knows \" \\ \/ \b \f \n \r \t \uXXXX, so keep the backslash itself.
      // \f \b \t \n \r before letters are left alone: maths.js already turns "\frac" read as form feed + "rac" back into \frac.
      if (n === "u" ? /^[0-9a-fA-F]{4}$/.test(t.substr(i + 2, 4)) : /["\\/bfnrt]/.test(n || "")) { out += c + n; i++; }
      else out += "\\\\";
      continue;
    }
    if (c === '"') { inStr = false; out += c; continue; }
    if (c === "\n") { out += "\\n"; continue; }          // a line break inside a string (the AI wrapped a long line)
    if (c === "\r") continue;
    if (c === "\t") { out += "\\t"; continue; }
    out += c;
  }
  return out;
}

const NOTHING = "Nothing here yet. Copy the quiz your AI made, then tap Paste quiz.";
const NOT_FOUND = "Couldn't find a quiz in that. Ask your AI to put the whole quiz in one json code block.";
const CUT = "The quiz looks cut off or has a slip, so it can't be read. Ask your AI to send the whole quiz again in one json code block.";

function readQuiz(raw) {
  let s = String(raw == null ? "" : raw).replace(/[﻿​-‍⁠]/g, "").replace(/\r\n?/g, "\n");
  if (!s.trim()) return { error: NOTHING };
  const a = s.search(START);
  if (a >= 0) { const rest = s.slice(a).replace(START, ""), b = rest.search(END); s = b >= 0 ? rest.slice(0, b) : rest; }
  // The quiz is the biggest object in the text; small ones are the AI's examples or chatter.
  const found = objects(s).sort((x, y) => y.text.length - x.text.length);
  if (!found.length) return { error: NOT_FOUND };
  let cutOff = false;
  for (const o of found.slice(0, 3)) {
    if (o.cut) { cutOff = true; continue; }
    for (const t of [o.text, mend(o.text)]) {
      try { const d = JSON.parse(t); if (d && typeof d === "object" && !Array.isArray(d) && (d.sections || d.questions)) return { data: d }; } catch (e) {}
    }
  }
  return { error: cutOff || found.some(o => /"sections"|"questions"/.test(o.text)) ? CUT : NOT_FOUND };
}

export { readQuiz, mend };
