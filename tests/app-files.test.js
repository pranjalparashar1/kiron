// The service worker must be able to save every file it lists, or phones never install the new version.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { read, ROOT } = require("./load.js");

test("every file in the service worker's shell exists", () => {
  const shell = JSON.parse(read("sw.js").match(/const SHELL = (\[[^\]]*\])/)[1]);
  for (const f of shell) if (f !== "./") assert.ok(fs.existsSync(path.join(ROOT, f)), `${f} is in SHELL but missing`);
});

test("VERSION looks like kiron-vN", () => {
  assert.match(read("sw.js"), /const VERSION = "kiron-v\d+";/);
});

test("app files parse", () => {
  for (const f of ["app.js", "maths.js", "parser.js", "build.js", "prompt.js", "sw.js"]) assert.doesNotThrow(() => new Function(read(f)), f);
  JSON.parse(read("manifest.webmanifest"));
});
