// The service worker must be able to save every file it lists, or phones never install the new version.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { read, ROOT } = require("./load.js");
const MODULES = fs.readdirSync(path.join(ROOT, "js")).filter(f => f.endsWith(".js")).map(f => "js/" + f);

test("every file in the service worker's shell exists", () => {
  const shell = JSON.parse(read("sw.js").match(/const SHELL = (\[[^\]]*\])/)[1]);
  for (const f of shell) if (f !== "./") assert.ok(fs.existsSync(path.join(ROOT, f)), `${f} is in SHELL but missing`);
});

test("VERSION looks like kiron-vN", () => {
  assert.match(read("sw.js"), /const VERSION = "kiron-v\d+";/);
});

test("app files parse", () => {
  for (const f of ["import.js", "prompt.js", "sw.js"]) assert.doesNotThrow(() => new Function(read(f)), f);
  for (const f of MODULES) assert.doesNotThrow(() => execFileSync(process.execPath, ["--check", path.join(ROOT, f)], { stdio: "pipe" }), f);
  JSON.parse(read("manifest.webmanifest"));
});

test("every module is in the service worker's shell", () => {
  const shell = JSON.parse(read("sw.js").match(/const SHELL = (\[[^\]]*\])/)[1]);
  for (const f of MODULES) assert.ok(shell.includes(f), `${f} is missing from SHELL, so phones would run without it offline`);
});

// A name imported from a module that doesn't export it stops the whole app before it draws anything.
test("every imported name is exported by its module", () => {
  const exportsOf = f => new Set([...read(f).matchAll(/^export \{([^}]*)\};?$/gm)].flatMap(m => m[1].split(",").map(x => x.trim().split(/\s+as\s+/).pop()).filter(Boolean)));
  for (const f of MODULES) {
    for (const [, names, from] of read(f).matchAll(/^import \{([^}]*)\} from "\.\/([\w-]+\.js)";$/gm)) {
      const have = exportsOf("js/" + from);
      for (const n of names.split(",").map(x => x.trim().split(/\s+as\s+/)[0]).filter(Boolean)) assert.ok(have.has(n), `${f} imports ${n} from ${from}, which doesn't export it`);
    }
  }
});

test("index.html starts the app as a module", () => {
  assert.match(read("index.html"), /<script type="module" src="js\/app\.js"><\/script>/);
});
