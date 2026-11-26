// The app's logic lives in native ES modules under js/. Node loads them as they are (no build step, nothing to
// install), so the tests use the very code the phone runs. Modules that draw the page are not loaded here.
"use strict";
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
// Progress is saved to localStorage; here it is kept in memory for the length of a test run.
if (typeof globalThis.localStorage === "undefined") {
  const m = new Map();
  globalThis.localStorage = { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); } };
}
const mod = name => require(path.join(ROOT, "js", name + ".js"));

// The same names the tests have always used.
function load() {
  const { validateQuiz } = mod("validate"), round = mod("round"), { fmt } = mod("maths");
  return { SB: { validateQuiz, buildRound: round.buildRound, formOf: round.formOf, durOf: round.durFor, TIME: round.TIME, fmt }, fmt };
}

module.exports = { load, mod, read, ROOT };
