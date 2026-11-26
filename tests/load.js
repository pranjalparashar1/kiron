// Loads the browser files (maths.js, app.js) into a sandbox so their logic can be tested with node --test.
// The page itself is a stand-in: every DOM call does nothing, so app.js boots without a browser and
// exposes window.SB (validateQuiz, buildRound, TIME, fmt...) exactly as the phone gets it.
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");

// A thing that answers every property and every call with itself.
function nothing() {
  const f = function () { return p; };
  const p = new Proxy(f, {
    get(t, k) {
      if (k === Symbol.toPrimitive) return () => "";
      if (k === "then") return undefined;            // not a promise
      if (k === Symbol.iterator) return function* () {};
      if (k === "length") return 0;
      return p;
    },
    set() { return true; },
    apply() { return p; },
    construct() { return p; },
    has() { return true; }
  });
  return p;
}

function load(files = ["maths.js", "app.js"]) {
  const store = new Map();
  const el = nothing();
  const window = {
    document: new Proxy({}, { get: (t, k) => k === "querySelectorAll" ? () => [] : el }),
    location: { hash: "", href: "http://localhost/", replace() {}, reload() {} },
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
    navigator: { userAgent: "node" },
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    addEventListener() {}, removeEventListener() {},
    requestAnimationFrame: () => 0, cancelAnimationFrame() {},
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    fetch: () => new Promise(() => {}),           // the library never finishes loading; tests feed quizzes directly
    getComputedStyle: () => el, innerWidth: 390, innerHeight: 844, devicePixelRatio: 3,
    performance: { now: () => 0 },
    console
  };
  window.window = window; window.self = window; window.globalThis = window;
  const ctx = vm.createContext(window);
  for (const f of files) vm.runInContext(read(f), ctx, { filename: f });
  return window;
}

module.exports = { load, read, ROOT };
