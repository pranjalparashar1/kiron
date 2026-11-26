// parser.js: whatever an AI app hands back, the quiz comes out, or one kind sentence says what to ask the AI for.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { load } = require("./load.js");

const w = load(["maths.js", "app.js", "parser.js"]);
const { readQuiz } = w.KironParse, { validateQuiz } = w.SB;
const fx = f => fs.readFileSync(path.join(__dirname, "fixtures", f), "utf8");
const golden = () => readQuiz(fx("golden.md")).data;

test("golden path: markers and a json fence", () => {
  const r = readQuiz(fx("golden.md"));
  assert.ok(r.data, r.error);
  assert.equal(r.data.id, "bond-basics");
  assert.deepEqual(validateQuiz(r.data).errors, undefined);
});

test("a whole AI reply: chatter, an example object, nested fences", () => {
  const r = readQuiz(fx("chatter.md"));
  assert.ok(r.data, r.error);
  assert.equal(JSON.stringify(r.data), JSON.stringify(golden()));
});

test("messy AI output is mended: BOM, curly quotes, trailing commas, one-backslash TeX, a wrapped line", () => {
  const r = readQuiz(fx("messy-ai.md"));
  assert.ok(r.data, r.error);
  const v = validateQuiz(r.data);
  assert.equal(v.errors, undefined, (v.errors || []).join(" | "));
  const g = golden();
  assert.equal(r.data.title, g.title);
  assert.equal(r.data.sections[1].questions[1].items.length, 4);
  assert.match(r.data.sections[0].questions[0].prompt, /^When market\nyields rise/);
  // \frac and \times survive either way: maths.js mends a \f or \t that JSON read as a control character
  const opt = r.data.sections[1].questions[0].options;
  assert.match(w.fmt(opt[0]), /class="frac"/);
  assert.match(w.fmt(opt[1]), /×/);
});

test("valid JSON is never changed by mending", () => {
  const t = JSON.stringify(golden());
  assert.equal(w.KironParse.mend(t), t);
});

test("a .json file and a bare pasted object", () => {
  const t = JSON.stringify(golden());
  assert.ok(readQuiz(t).data);
  assert.ok(readQuiz("Here:\n" + t + "\nDone.").data);
});

test("cut off while copying: a kind sentence, not a crash", () => {
  const r = readQuiz(fx("cut-off.md"));
  assert.match(r.error, /cut off/);
});

test("nothing, garbage and the wrong thing", () => {
  assert.match(readQuiz("").error, /Nothing here yet/);
  assert.match(readQuiz("   \n ").error, /Nothing here yet/);
  assert.match(readQuiz("Just a shopping list: eggs, milk").error, /Couldn't find a quiz/);
  assert.match(readQuiz('{"name": "not a quiz"}').error, /Couldn't find a quiz/);
  assert.match(readQuiz("{{{{").error, /./);
  for (const junk of [null, undefined, 42, "}{", "```json\n```", "\u0000\u0001", "<!-- KIRON-QUIZ-START -->"]) assert.doesNotThrow(() => readQuiz(junk));
});

test("error messages never use failure words", () => {
  for (const s of ["", "eggs", fx("cut-off.md"), "{\"sections\": [}"]) assert.doesNotMatch(readQuiz(s).error, /wrong|fail|incorrect|invalid|error/i);
});

test("the prompt asks for the markers the parser looks for", () => {
  const p = load(["prompt.js"]).SB_PROMPT;
  assert.match(p, /<!-- KIRON-QUIZ-START -->/); assert.match(p, /<!-- KIRON-QUIZ-END -->/);
  assert.match(p, /What are you reading this for/);
});
