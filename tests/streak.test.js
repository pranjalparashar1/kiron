// The streak: a slip cools it one stage instead of putting it out (Kiron 1.7.1).
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { mod } = require("./load.js");
const { STAGES, heatLevel, cooled } = mod("fx");

test("a slip drops the streak to the start of the stage below", () => {
  assert.deepEqual([...STAGES], [3, 5, 8, 11, 15, 20, 25, 30]);
  assert.equal(cooled(17), 11);   // black fire -> white-hot
  assert.equal(cooled(15), 11);
  assert.equal(cooled(32), 25);   // galaxy -> constellation
  assert.equal(cooled(9), 5);
  assert.equal(cooled(5), 3);
});

test("from amber, or below the fire, a slip puts it out", () => {
  for (const n of [0, 1, 2, 3, 4]) assert.equal(cooled(n), 0, String(n));
});

test("cooling always goes down exactly one stage", () => {
  for (let n = 5; n <= 40; n++) assert.equal(heatLevel(cooled(n)), heatLevel(n) - 1, String(n));
});
