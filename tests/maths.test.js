// maths.js: quiz text in, safe HTML out. Quizzes now come from anyone's AI chat, so nothing in them may
// become a tag, an attribute or a script; only maths.js's own markup is allowed through.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load.js");

const fmt = load().fmt;

// The only markup fmt() makes. Anything else in its output came from the quiz, which must never happen.
const TAGS = new Set(["span", "sup", "sub", "b", "i", "br", "svg", "path", "circle"]);
const ATTRS = new Set(["class", "viewBox", "preserveAspectRatio", "aria-hidden", "aria-label", "role", "d", "vector-effect", "cx", "cy", "r"]);
function assertSafe(input) {
  const out = fmt(input);
  const rest = out.replace(/<(\/?)([a-zA-Z][\w-]*)((?:\s+[\w:-]+="[^"<>]*")*)\s*(\/?)>/g, (all, close, tag, attrs) => {
    assert.ok(TAGS.has(tag), `tag <${tag}> from ${JSON.stringify(input)}\n${out}`);
    for (const [, name, value] of attrs.matchAll(/([\w:-]+)="([^"]*)"/g)) {
      assert.ok(ATTRS.has(name), `attribute ${name} from ${JSON.stringify(input)}\n${out}`);
      // aria-label carries the formula as escaped text (read aloud, never run); the drawing attributes are maths.js's own.
      if (name !== "aria-label") assert.match(value, /^[\w .,:\-]*$/, `attribute ${name}="${value}" from ${JSON.stringify(input)}`);
    }
    return "";
  });
  assert.ok(!/[<>"]/.test(rest), `raw markup left from ${JSON.stringify(input)}\n${out}`);
  return out;
}

const PAYLOADS = [
  `<img src=x onerror=alert(1)>`, `<script>alert(1)</script>`, `" onmouseover="alert(1)`, `' onfocus='alert(1)`,
  `javascript:alert(1)`, `<a href="javascript:alert(1)">x</a>`, `<svg onload=alert(1)>`, `</span><script>x</script>`,
  `\\(\\text{<script>alert(1)</script>}\\)`, `\\(\\frac{<img src=x onerror=alert(1)>}{2}\\)`, `\\(x^{"><b>}\\)`,
  `\\(\\sqrt[<i>]{x}\\)`, `\\(\\left< x \\right>\\)`, `\\(\\mathbf{"onclick="x}\\)`, `\\(\\<script\\>\\)`,
  `\\[\\sum_{<b>}^{</b>} x\\]`, `\\(\\binom{<}{>}\\)`, `\\(\\bar{</span>}\\)`, `\\(\\hat{"}\\)`, `\\(\\operatorname{<x>}\\)`,
  `x^(<b>) / y_(</sup>)`, `√(<img>)`, `**<b>bold</b>**`, `*<i>*`, `1/<2>`, `(1 + r/2)^<4>`,
  "\u00010\u0001", "a \u0002 b / c", `\\(x\\) \u00010\u0001`, "\\(\f rac{a}{<b>}\\)", `&lt;script&gt;`, `&#60;script&#62;`
];

for (const p of PAYLOADS) test(`safe: ${JSON.stringify(p).slice(0, 60)}`, () => { assertSafe(p); });

test("no place-holder can pull in another formula", () => {
  assert.doesNotMatch(fmt("\\(x\\) \u00010\u0001"), /undefined/);
  assert.equal((fmt("\\(x\\) and \u00010\u0001").match(/role="math"/g) || []).length, 1);
});

test("fuzz: random mixes of TeX and HTML stay safe", () => {
  const bits = ["\\(", "\\)", "\\[", "\\]", "\\frac", "\\sqrt", "\\text", "\\left", "\\right", "\\sum", "\\int", "\\mathbf", "\\bar", "\\hat",
    "{", "}", "(", ")", "[", "]", "^", "_", "/", "÷", "√", "*", "**", "<", ">", "\"", "'", "&", "=", " ", "x", "2", "ab", "Δ",
    "<script>", "<img src=x onerror=alert(1)>", "onerror=", "javascript:", "</span>", "<svg>", "\n", "\u0001", "\u0002", "&lt;", "#"];
  let seed = 7; const rnd = n => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  for (let k = 0; k < 3000; k++) {
    let s = ""; const len = 1 + rnd(14);
    for (let j = 0; j < len; j++) s += bits[rnd(bits.length)];
    assertSafe(s);
  }
});

// What a quiz author sees: a few shapes the renderer must keep drawing the same way.
test("plain maths is typeset", () => {
  assert.equal(fmt("x^2"), "x<sup>2</sup>");
  assert.equal(fmt("z_m"), "z<sub>m</sub>");
  assert.match(fmt("104/1.06^3"), /class="frac"/);
  assert.match(fmt("√250"), /class="m-rad"/);
  assert.match(fmt("1.03^(89/180)"), /class="m-pw"><span class="frac">/);
  assert.equal(fmt("P/Es"), "P/Es");                 // not maths
  assert.equal(fmt("BBB / Baa3"), "BBB / Baa3");     // ratings, not a fraction
  assert.equal(fmt("$5 and $6"), "$5 and $6");       // $ is currency, never a maths sign
  assert.equal(fmt("**bold** and *it*"), "<b>bold</b> and <i>it</i>");
});

test("TeX is typeset", () => {
  assert.match(fmt("\\(\\frac{a}{b}\\)"), /<span class="frac"><span>a<\/span><span>b<\/span><\/span>/);
  assert.match(fmt("\\[\\sum_{i=1}^{n} x_i\\]"), /m-block/);
  assert.match(fmt("\\(\\unknown\\)"), /\\unknown/);  // unknown commands show as written
  assert.match(fmt("\frac{a}{b}".replace("\f", "\\(\f") + "\\)"), /class="frac"/); // single backslash slip mended
});
