// Small source-text helpers shared by the check and sync scripts. Not a parser:
// they're deliberately simple, and each limit is written next to the code.

/** Remove // and /* *\/ comments, keeping strings and line breaks.
 *  A `//` inside a string ("https://…") is NOT a comment. With blankStrings,
 *  string contents become spaces too (quotes kept), so a word inside a string
 *  can't match a code pattern. */
export function stripComments(src, { blankStrings = false } = {}) {
  let out = "", i = 0, q = null;
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (q) {
      if (c === "\\") { out += blankStrings ? "  " : c + (n ?? ""); i += 2; continue; }
      if (c === q) { q = null; out += c; i++; continue; }
      out += blankStrings && c !== "\n" ? " " : c; i++; continue;
    }
    if (c === '"' || c === "'" || c === "`") { q = c; out += c; i++; continue; }
    if (c === "/" && n === "/") { while (i < src.length && src[i] !== "\n") i++; continue; }
    if (c === "/" && n === "*") {
      const end = src.indexOf("*/", i + 2);
      const chunk = src.slice(i, end < 0 ? src.length : end + 2);
      out += chunk.replace(/[^\n]/g, " ");
      i += chunk.length; continue;
    }
    out += c; i++;
  }
  return out;
}

const CONTROL = /\b(if|for|while|switch|catch|with)\s*$/;
const BLOCK_KW = /\b(else|try|finally|do|static)\s*$/;

/** The text that runs at IMPORT time: everything not inside a function body.
 *  A `{` opens a function body when it follows `=>`, or follows `)` whose
 *  matching `(` isn't preceded by if/for/while/switch/catch. Object literals,
 *  class bodies and top-level if/try blocks count as import-time (conservative).
 *  Brace-less arrow bodies are handled by `importTimeHits` (statement-level `=>`). */
export function importTimeText(src) {
  const code = stripComments(src, { blankStrings: true });
  const stack = []; // true = function body
  let out = "";
  for (let i = 0; i < code.length; i++) {
    const c = code[i];
    const inFn = stack.includes(true);
    if (c === "{") {
      const before = code.slice(0, i).replace(/\s+$/, "");
      let fn = false;
      if (before.endsWith("=>")) fn = true;
      else if (before.endsWith(")")) {
        let d = 0, j = before.length - 1;
        for (; j >= 0; j--) { if (before[j] === ")") d++; else if (before[j] === "(" && --d === 0) break; }
        fn = !CONTROL.test(before.slice(0, j));
      } else if (BLOCK_KW.test(before)) fn = false;
      else if (/:\s*[\w<>[\]|, .]+$/.test(before) && /\)\s*:/.test(before.slice(-200))) fn = true; // `): Type {`
      stack.push(fn);
      out += inFn || fn ? " " : c;
      continue;
    }
    if (c === "}") { stack.pop(); out += stack.includes(true) ? " " : c; continue; }
    out += inFn && c !== "\n" ? " " : c;
  }
  return out;
}

// Not after a "." (x.document, a regex like /a\.document/) and not an object key (document: ...).
const GLOBAL = /(?<![.\w$])(window|document|localStorage|sessionStorage)\b(?!\s*:)/;
/** Import-time statements that touch a browser global (`typeof window` is fine). */
export function importTimeHits(src) {
  return importTimeText(src)
    .split(/;|\n/)
    .map((s) => s.replace(/\btypeof\s+(window|document|localStorage|sessionStorage)\b/g, ""))
    .filter((s) => { const m = s.match(GLOBAL); return m && !s.slice(0, m.index).includes("=>"); })
    .map((s) => s.trim());
}
