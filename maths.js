/* Kiron maths. Two ways in, one look out (plain HTML + CSS in the page font, with small stretchy SVG strokes;
   no maths font, no library).
   1. Plain quiz text is typeset as it always was: x^2, z_m, a/b, a ÷ b, proper − and ×, and now √ with a bar
      that covers what is under it.
   2. Anything between \( and \) (or \[ and \] for a centred line) is read as TeX: \frac, \sqrt, \sum, \prod,
      \int, \oint, \lim, \partial, brackets that grow, and any nesting of them. See QUIZ_FORMAT.md. */
(function () {
"use strict";
const mEsc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const SUPM = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "⁻": "−", "⁺": "+", "ⁿ": "n", "ᵗ": "t" };
const SUBM = { "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4", "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9", "₋": "−", "₊": "+", "ₙ": "n", "ₜ": "t", "ₘ": "m", "ₓ": "x", "ₐ": "a", "ₑ": "e", "ₒ": "o", "ᵢ": "i", "ⱼ": "j", "ₖ": "k", "ₗ": "l", "ₛ": "s", "ₚ": "p", "ₕ": "h" };
const GRK = "\\u0370-\\u03FF";
// One side of a fraction: a bracket (a Greek letter may lead it, as in Σ(…)), a number, or letters and digits; powers and subscripts ride along (Δ²p).
const FSUP = "(?:<su[bp]>[^<]*<\\/su[bp]>)", FTERM = "(?:[" + GRK + "]*\\([^()]+\\)|\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?%?|[A-Za-z0-9" + GRK + "]+(?:\\.\\d+)*%?(?:" + FSUP + "+[A-Za-z" + GRK + "]+)*)" + FSUP + "*";
// Lookbehind (?<!...) is not supported before iOS 16.4: if it throws, skip fraction/minus typesetting instead of showing a blank app.
let FRAC_RE = null, LB = true;
try { FRAC_RE = new RegExp("(?<![\\w" + GRK + ".)\\]√-])(" + FTERM + ")\\s*[\\/÷]\\s*(" + FTERM + ")(?![\\w" + GRK + "\\[(,]|\\.\\d|<su)", "g"); new RegExp("(?<=[\\d)])x"); } catch (e) { LB = false; FRAC_RE = null; }

/* ---- the drawn strokes: they stretch to the height of what they sit beside, and the line keeps its thickness ---- */
const mSvg = (cls, w, h, d, more) => `<svg class="${cls}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><path vector-effect="non-scaling-stroke" d="${d}"/>${more || ""}</svg>`;
const RAD_SVG = mSvg("m-rs", 10, 20, "M.6 12.6 2.6 11.6 5.6 19.2 10 0");
const FENCE = {
  "(": "M5 .4Q.6 10 5 19.6", ")": "M1 .4Q5.4 10 1 19.6",
  "[": "M5 .5H1.6V19.5H5", "]": "M1 .5H4.4V19.5H1",
  "{": "M5 .5Q3 .5 3 2.6V8Q3 10 1 10 3 10 3 12V17.4Q3 19.5 5 19.5", "}": "M1 .5Q3 .5 3 2.6V8Q3 10 5 10 3 10 3 12V17.4Q3 19.5 1 19.5",
  "|": "M3 0V20"
};
const BIGOP = {
  sum: `<svg class="m-big" viewBox="0 0 12 16" aria-hidden="true"><path d="M10.4 3.4V1.5H1.6L7 8 1.6 14.5h8.8v-1.9"/></svg>`,
  prod: `<svg class="m-big" viewBox="0 0 12 16" aria-hidden="true"><path d="M.8 1.5h10.4M3 1.5v13.4M9 1.5v13.4"/></svg>`,
  int: `<svg class="m-big m-int" viewBox="0 0 8 20" aria-hidden="true"><path d="M7.2 2.3C7 .7 4.9.5 4.5 2.6 4.1 4.6 4.1 7 4 10s0 5.4-.5 7.4C3.1 19.5 1 19.3.8 17.7"/></svg>`,
  oint: `<svg class="m-big m-int" viewBox="0 0 8 20" aria-hidden="true"><path d="M7.2 2.3C7 .7 4.9.5 4.5 2.6 4.1 4.6 4.1 7 4 10s0 5.4-.5 7.4C3.1 19.5 1 19.3.8 17.7"/><circle cx="4" cy="10" r="2.7"/></svg>`
};
const radical = (body, index) => `<span class="m-rad">${index ? `<span class="m-ri">${index}</span>` : ""}${RAD_SVG}<span class="m-rb">${body}</span></span>`;
const fraction = (a, b) => `<span class="frac"><span>${a}</span><span>${b}</span></span>`;

/* ---- 1. plain quiz text ---- */
// After a √: what does it cover? A bracket (to its partner), a stacked fraction, or the number / letters that follow.
function rootOperand(h, i) {
  if (h[i] === "(") {
    let d = 0;
    for (let j = i; j < h.length; j++) { if (h[j] === "(") d++; else if (h[j] === ")" && !--d) return { body: h.slice(i + 1, j), end: j + 1 }; }
    return null;
  }
  if (h.startsWith('<span class="frac">', i)) {
    const re = /<span\b|<\/span>/g; re.lastIndex = i; let d = 0, m;
    while ((m = re.exec(h))) { if (m[0] === "</span>") { if (!--d) return { body: h.slice(i, re.lastIndex), end: re.lastIndex }; } else d++; }
    return null;
  }
  const m = new RegExp("^(?:\\d[\\d,]*(?:\\.\\d+)?%?|[A-Za-z" + GRK + "]+)(?:<su[bp]>[^<]*<\\/su[bp]>)*").exec(h.slice(i));
  if (!m) return null;
  const t = m[0].replace(/,$/, "");
  return { body: t, end: i + t.length };
}
function roots(h) {
  let out = "", i = 0, k;
  while ((k = h.indexOf("√", i)) >= 0) {
    out += h.slice(i, k);
    let j = k + 1; while (h[j] === " ") j++;
    const op = rootOperand(h, j);
    if (op) { out += radical(roots(op.body)); i = op.end; } else { out += "√"; i = k + 1; }
  }
  return out + h.slice(i);
}
function mathify(h) {
  const supm = c => SUPM[c] || c, subm = c => SUBM[c] || c;
  h = h.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺ⁿᵗ]+/g, m => "<sup>" + [...m].map(supm).join("") + "</sup>")
       .replace(/[₀₁₂₃₄₅₆₇₈₉₋₊ₙₜₘₓₐₑₒᵢⱼₖₗₛₚₕ]+/g, m => "<sub>" + [...m].map(subm).join("") + "</sub>")
       .replace(/\^\(([^)]*)\)/g, (_, a) => "<sup>" + a.replace(/-/g, "−") + "</sup>")
       .replace(/\^(-?\d+(?:\.\d+)?|[A-Za-z]\w*)/g, (_, a) => "<sup>" + a.replace(/-/g, "−") + "</sup>")
       .replace(/_\(([^)]*)\)/g, "<sub>$1</sub>")
       .replace(/_([A-Za-z0-9]+)/g, "<sub>$1</sub>")
       .replace(/(^|[\s(=×÷+<>\/])-(?=\.?\d)/g, "$1−");
  if (LB) h = h.replace(new RegExp("(?<=[\\d)])\\s[x*]\\s(?=[\\d(])", "g"), " × ").replace(new RegExp("(?<=[\\d)>%])\\s-\\s(?=[\\d(.])", "g"), " − ");
  if (FRAC_RE) {
    const strip = t => { const m = t.match(/^\(([^()]*)\)$/); return m ? m[1] : t; };
    const greek = new RegExp("[" + GRK + "]");
    for (let k = 0; k < 3; k++) {
      const before = h;
      h = h.replace(FRAC_RE, (all, a, b) => {
        const pa = a.replace(/<[^>]*>/g, ""), pb = b.replace(/<[^>]*>/g, "");
        const word = x => /^[A-Za-z]{3,}$/.test(x) && x !== x.toUpperCase() && !/^[A-Z]{2,}[a-z]$/.test(x);
        const digits = /\d/.test(pa + pb) || greek.test(pa + pb), shortVars = pa.length <= 4 && pb.length <= 4 && !(pa === pa.toUpperCase() && pb === pb.toUpperCase());
        // not maths: "BBB / Baa3" (ratings), "P/Es", "y/y"
        const notMath = /^[A-Za-z]{2,}\d+$/.test(a) || /^[A-Za-z]{2,}\d+$/.test(b) || /^[A-Z]s$/.test(pb) || (pa === pb && !digits);
        if (notMath || word(pa) || word(pb) || (!digits && !shortVars)) return all;
        return fraction(strip(a), strip(b));
      });
      if (h === before) break;
    }
  }
  return h.indexOf("√") < 0 ? h : roots(h);
}

/* ---- 2. TeX between \( and \) ---- */
const TEX_SYM = {
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", varepsilon: "ε", zeta: "ζ", eta: "η", theta: "θ", iota: "ι", kappa: "κ", lambda: "λ", mu: "μ", nu: "ν", xi: "ξ", pi: "π", rho: "ρ", sigma: "σ", tau: "τ", upsilon: "υ", phi: "φ", varphi: "φ", chi: "χ", psi: "ψ", omega: "ω",
  Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", Xi: "Ξ", Pi: "Π", Sigma: "Σ", Phi: "Φ", Psi: "Ψ", Omega: "Ω",
  partial: "∂", nabla: "∇", infty: "∞", cdots: "⋯", ldots: "…", dots: "…", prime: "′", degree: "°", forall: "∀", exists: "∃", ell: "ℓ", hbar: "ℏ",
  "%": "%", "$": "$", "&": "&amp;", "#": "#", "_": "_", "{": "{", "}": "}", "|": "‖"
};
// Signs that sit between two things and get a little air on each side.
const TEX_REL = { times: "×", cdot: "·", div: "÷", pm: "±", mp: "∓", le: "≤", leq: "≤", ge: "≥", geq: "≥", ne: "≠", neq: "≠", approx: "≈", equiv: "≡", sim: "∼", propto: "∝", to: "→", rightarrow: "→", leftarrow: "←", Rightarrow: "⇒", Leftrightarrow: "⇔", "in": "∈", notin: "∉", subset: "⊂", cup: "∪", cap: "∩", ll: "≪", gg: "≫" };
const TEX_FN = ["sin", "cos", "tan", "cot", "sec", "csc", "arcsin", "arccos", "arctan", "sinh", "cosh", "tanh", "ln", "log", "exp", "det", "gcd", "arg", "deg", "dim", "ker", "cov", "var", "Pr"];
const TEX_LIMFN = ["lim", "max", "min", "sup", "inf", "argmax", "argmin"];
const TEX_ACC = { hat: "̂", tilde: "̃", vec: "⃗", dot: "̇", ddot: "̈" };
const TEX_SPACE = { ",": "m-s1", ":": "m-s2", ";": "m-s2", " ": "m-s2", quad: "m-s4", qquad: "m-s5", "!": "" };

function texRow(src) {
  let i = 0, tight = 0; // tight: inside a sub/superscript, where signs get no air
  const n = src.length, e = t => mEsc(t);
  const ws = () => { while (i < n && /\s/.test(src[i])) i++; };
  const name = () => { const m = /^[A-Za-z]+/.exec(src.slice(i)); if (m) { i += m[0].length; return m[0]; } return src[i++] || ""; };
  const peekCmd = c => src.startsWith("\\" + c, i) && !/[A-Za-z]/.test(src[i + c.length + 1] || "");
  // one argument: {…} or a single thing
  const arg = () => { ws(); if (src[i] === "{") { i++; return row("}"); } return atom(true) || { h: "", tall: false }; };
  const delim = () => { ws(); if (src[i] === "\\") { i++; const c = name(); return c === "{" || c === "}" || c === "|" ? c : c === "langle" ? "(" : c === "rangle" ? ")" : ""; } return src[i++] || ""; };
  const fence = (l, body, r) => ({ h: `<span class="m-fence">${FENCE[l] ? mSvg("m-fd", 6, 20, FENCE[l]) : ""}<span class="m-fb">${body}</span>${FENCE[r] ? mSvg("m-fd", 6, 20, FENCE[r]) : ""}</span>`, tall: true, kind: "fence" });
  const scripts = (base, sub, sup) => {
    if (!sub && !sup) return base;
    const k = base.kind;
    if (k === "over") return { h: `<span class="m-op"><span class="m-lim">${sup ? sup.h : ""}</span><span class="m-opb">${base.h}</span><span class="m-lim">${sub ? sub.h : ""}</span></span>`, tall: true };
    if (k === "side") return { h: `${base.h}<span class="m-ss m-il"><span>${sup ? sup.h : "&nbsp;"}</span><span>${sub ? sub.h : "&nbsp;"}</span></span>`, tall: true };
    // on a tall bracket the power sits at the top corner and the subscript at the bottom one
    if (k === "fence") return { h: base.h.slice(0, -7) + (sup ? `<span class="m-ft">${sup.h}</span>` : "") + (sub ? `<span class="m-ft m-fu">${sub.h}</span>` : "") + "</span>", tall: true };
    if (sub && sup) return { h: `${base.h}<span class="m-ss"><span>${sup.h}</span><span>${sub.h}</span></span>`, tall: base.tall };
    return { h: base.h + (sup ? `<sup>${sup.h}</sup>` : `<sub>${sub.h}</sub>`), tall: base.tall };
  };
  // one thing, with any _ and ^ that follow it (unless it is itself an argument of _ or ^)
  function atom(bare) {
    ws(); if (i >= n) return null;
    let a = base(); if (!a) return null;
    if (bare) return a;
    let sub = null, sup = null, primes = "";
    for (;;) {
      ws();
      if (src[i] === "'") { primes += "′"; i++; }
      else if (src[i] === "_" && !sub) { i++; tight++; sub = arg(); tight--; }
      else if (src[i] === "^" && !sup) { i++; tight++; sup = arg(); tight--; }
      else break;
    }
    if (primes) a = { h: a.h + primes, tall: a.tall, kind: a.kind };
    const out = scripts(a, sub, sup);
    out.t = a.t; return out;
  }
  function base() {
    const c = src[i];
    if (c === "{") { i++; return row("}"); }
    if (c === "(" || c === "[") {
      const close = c === "(" ? ")" : "]"; i++;
      const r = row(close);
      if (!r.closed) return { h: c + r.h, tall: r.tall };
      return r.tall ? fence(c, r.h, close) : { h: c + r.h + close, tall: false };
    }
    if (/\d/.test(c)) { const m = /^\d+(?:,\d{3})*(?:\.\d+)?/.exec(src.slice(i)); i += m[0].length; return { h: m[0], tall: false }; }
    if (c === "√") { i++; const a = arg(); return { h: radical(a.h), tall: a.tall }; }
    if (c === "Σ" || c === "∑") { i++; return { h: BIGOP.sum, tall: true, kind: "over" }; }
    if (c === "∏") { i++; return { h: BIGOP.prod, tall: true, kind: "over" }; }
    if (c === "∫") { i++; return { h: BIGOP.int, tall: true, kind: "side" }; }
    if (c === "∮") { i++; return { h: BIGOP.oint, tall: true, kind: "side" }; }
    if (c === "-" || c === "−") { i++; return { h: "−", t: "bin" }; }
    if ("+=<>×÷±≤≥≠≈→".indexOf(c) >= 0) { i++; return { h: e(c), t: "bin" }; }
    if (c === "*") { i++; return { h: "×", t: "bin" }; }
    if (c === ",") { i++; return { h: ", ", t: "punct" }; }
    if (c === "~") { i++; return { h: "&nbsp;" }; }
    if (c === "|") { i++; return { h: "|" }; }
    if (c !== "\\") { i++; return { h: e(c), tall: false }; }
    i++;
    const cmd = name();
    if (cmd === "frac" || cmd === "dfrac" || cmd === "tfrac") { const a = arg(), b = arg(); return { h: fraction(a.h, b.h), tall: true }; }
    if (cmd === "binom") { const a = arg(), b = arg(); return fence("(", `<span class="frac m-nobar"><span>${a.h}</span><span>${b.h}</span></span>`, ")"); }
    if (cmd === "sqrt") {
      ws(); let idx = "";
      if (src[i] === "[") { i++; idx = row("]").h; }
      const a = arg(); return { h: radical(a.h, idx), tall: a.tall };
    }
    if (cmd === "sum") return { h: BIGOP.sum, tall: true, kind: "over" };
    if (cmd === "prod") return { h: BIGOP.prod, tall: true, kind: "over" };
    if (cmd === "int") return { h: BIGOP.int, tall: true, kind: "side" };
    if (cmd === "iint") return { h: BIGOP.int + BIGOP.int, tall: true, kind: "side" };
    if (cmd === "oint") return { h: BIGOP.oint, tall: true, kind: "side" };
    if (cmd === "left") { const l = delim(), r = row("\\right"); const rd = r.closed ? delim() : ""; return fence(l, r.h, rd); }
    if (cmd === "text" || cmd === "mathrm" || cmd === "textrm" || cmd === "operatorname") { ws(); if (src[i] !== "{") return { h: "" }; const j = src.indexOf("}", i); const t = src.slice(i + 1, j < 0 ? n : j); i = j < 0 ? n : j + 1; return { h: e(t), tall: false }; }
    if (cmd === "mathbf" || cmd === "textbf" || cmd === "boldsymbol") { const a = arg(); return { h: `<b>${a.h}</b>`, tall: a.tall }; }
    if (cmd === "mathit" || cmd === "textit") { const a = arg(); return { h: `<i>${a.h}</i>`, tall: a.tall }; }
    if (cmd === "bar" || cmd === "overline") { const a = arg(); return { h: `<span class="m-bar">${a.h}</span>`, tall: a.tall }; }
    if (TEX_ACC[cmd]) { const a = arg(); return { h: a.h + TEX_ACC[cmd], tall: a.tall }; }
    if (TEX_LIMFN.indexOf(cmd) >= 0) return { h: cmd, kind: "over", t: "fn" };
    if (TEX_FN.indexOf(cmd) >= 0) return { h: cmd, t: "fn" };
    if (TEX_REL[cmd]) return { h: TEX_REL[cmd], t: "bin" };
    if (TEX_SYM[cmd]) return { h: TEX_SYM[cmd], tall: false };
    if (cmd in TEX_SPACE) return { h: TEX_SPACE[cmd] ? `<span class="${TEX_SPACE[cmd]}"></span>` : "", t: "sp" };
    if (cmd === "\\") return { h: "<br>", t: "sp" };
    if (cmd === "displaystyle" || cmd === "limits" || cmd === "nolimits" || cmd === "big" || cmd === "Big" || cmd === "bigg") return { h: "", t: "sp" };
    return { h: e("\\" + cmd), tall: false }; // not a command we know: show it as written, so the slip is easy to see
  }
  // a run of things up to `stop` ("}", ")", "]", "\right" or the end)
  function row(stop) {
    let h = "", tall = false, prev = "open", closed = false;
    for (;;) {
      ws();
      if (i >= n) break;
      if (stop === "\\right" ? peekCmd("right") : src[i] === stop) { i += stop.length; closed = true; break; }
      if (stop !== "}" && src[i] === "}") break; // a stray } ends the row; the caller copes
      const a = atom(); if (!a) break;
      if (a.t === "bin") h += tight || prev === "open" || prev === "bin" ? a.h : " " + a.h + " ";
      else if (a.t === "fn") { ws(); h += (prev === "val" ? `<span class="m-s1"></span>` : "") + a.h + (src[i] === "(" || src[i] === "[" ? "" : `<span class="m-s1"></span>`); }
      else h += a.h;
      if (a.t !== "sp") prev = a.t === "bin" || a.t === "punct" ? "bin" : a.t === "fn" ? "open" : "val";
      tall = tall || !!a.tall;
    }
    return { h, tall, closed };
  }
  let out = "";
  while (i < n) { const r = row(null); out += r.h; if (i < n) { out += e(src[i]); i++; } }
  return out;
}
// "\frac" written with one backslash inside JSON turns into a control character + "rac". Put the backslash back.
const TEX_MEND = { "\f": "f", "\t": "t", "\b": "b", "\n": "n", "\r": "r", "\v": "v" };
const TEX_WORDS = "frac dfrac tfrac binom sqrt sum prod int iint oint left right text mathrm textrm operatorname mathbf textbf boldsymbol mathit textit bar overline quad qquad displaystyle limits nolimits big".split(" ")
  .concat(Object.keys(TEX_SYM), Object.keys(TEX_REL), Object.keys(TEX_ACC), TEX_FN, TEX_LIMFN);
function tex(src, block) {
  src = String(src).replace(/([\f\t\b\n\r\v])([a-z]+)/g, (all, c, rest) => TEX_WORDS.indexOf(TEX_MEND[c] + rest) >= 0 ? "\\" + TEX_MEND[c] + rest : all);
  let h;
  try { h = texRow(src); } catch (err) { h = mEsc(src); }
  return `<span class="m${block ? " m-block" : ""}" role="math" aria-label="${mEsc(src.trim())}">${h}</span>`;
}

/* ---- quiz text -> HTML: maths, **bold**, *italic*, line breaks ---- */
function fmt(s) {
  s = String(s == null ? "" : s);
  const held = [];
  if (s.indexOf("\\") >= 0) s = s.replace(/\\\(([\s\S]+?)\\\)|\\\[([\s\S]+?)\\\]/g, (_, a, b) => "\u0001" + (held.push(tex(a != null ? a : b, a == null)) - 1) + "\u0001");
  let h = mathify(mEsc(s)).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<i>$2</i>").replace(/\n/g, "<br>");
  return held.length ? h.replace(/\u0001(\d+)\u0001/g, (_, k) => held[+k]) : h;
}
window.fmt = fmt;
})();
