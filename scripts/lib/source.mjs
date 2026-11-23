// Source analysis for check-rules and sync-shared, built on the TypeScript
// compiler's own parser (already a dev dependency). Earlier regex versions
// kept losing track of strings, regex literals, JSX text and comments. A parser
// can't, so these answers are structural, not textual.
import ts from "typescript";

export function parse(text, fileName = "x.tsx") {
  return ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, fileName.endsWith(".ts") ? ts.ScriptKind.TS : ts.ScriptKind.TSX);
}

export function walk(node, fn, parents = []) {
  fn(node, parents);
  const next = [...parents, node];
  node.forEachChild((c) => walk(c, fn, next));
}

export const lineOf = (sf, pos) => sf.getLineAndCharacterOfPosition(pos).line;

/** The text with every comment replaced by spaces (line breaks kept), so a
 *  line-based check never sees a comment and never mistakes a string for one. */
export function blankComments(text, sf = parse(text)) {
  const chars = text.split("");
  const seen = new Set();
  // JSX text like <Txt>// note</Txt> is text, not a comment: trivia scans that start
  // next to it would otherwise read it as one.
  const jsxText = [];
  walk(sf, (n) => { if (n.kind === ts.SyntaxKind.JsxText) jsxText.push([n.pos, n.end]); });
  const inJsxText = (pos) => jsxText.some(([a, b]) => pos >= a && pos < b);
  const blank = (r) => {
    if (seen.has(r.pos) || inJsxText(r.pos)) return;
    seen.add(r.pos);
    for (let i = r.pos; i < r.end; i++) if (chars[i] !== "\n") chars[i] = " ";
  };
  const visit = (n) => {
    (ts.getLeadingCommentRanges(text, n.pos) ?? []).forEach(blank);
    (ts.getTrailingCommentRanges(text, n.end) ?? []).forEach(blank);
    n.getChildren(sf).forEach(visit); // getChildren includes tokens, so every trivia run is reached
  };
  visit(sf);
  return chars.join("");
}

const GLOBALS = new Set(["window", "document", "localStorage", "sessionStorage"]);

/** Identifier nodes that refer to a browser global as a VALUE: not `x.document`,
 *  not an object key, not a type, not JSX text. `typeof window` is excluded
 *  (it's the safe feature test). */
export function browserGlobalRefs(sf) {
  const hits = [];
  walk(sf, (n, parents) => {
    if (!ts.isIdentifier(n) || !GLOBALS.has(n.text)) return;
    const p = parents[parents.length - 1];
    if (p && ts.isPropertyAccessExpression(p) && p.name === n) return; // x.document
    if (p && (ts.isPropertyAssignment(p) || ts.isPropertySignature(p) || ts.isPropertyDeclaration(p) || ts.isMethodDeclaration(p)) && p.name === n) return; // { document: … }
    if (p && ts.isTypeOfExpression(p)) return; // typeof window
    // Types are erased, except a class `extends` expression, which runs (class X extends window.HTMLElement).
    const runtimeHeritage = parents.some((a, i) => ts.isExpressionWithTypeArguments(a) && ts.isHeritageClause(parents[i - 1]) &&
      parents[i - 1].token === ts.SyntaxKind.ExtendsKeyword && ts.isClassLike(parents[i - 2]));
    if (!runtimeHeritage && parents.some((a) => ts.isTypeNode(a) && !ts.isExpressionWithTypeArguments(a))) return;
    if (!runtimeHeritage && parents.some((a) => ts.isExpressionWithTypeArguments(a))) return; // implements, interface extends
    if (p && (ts.isImportSpecifier(p) || ts.isExportSpecifier(p) || (ts.isParameter(p) || ts.isVariableDeclaration(p)) && p.name === n)) return; // a name, not a default value
    hits.push({ node: n, parents });
  });
  return hits;
}

const isFnLike = (n) => ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n) ||
  ts.isMethodDeclaration(n) || ts.isGetAccessor(n) || ts.isSetAccessor(n) || ts.isConstructorDeclaration(n);

/** Is parents[i] (a function) called right where it's defined, e.g. `(() => {...})()`?
 *  Then its body runs when the enclosing code runs (at top level: import time). */
function isIIFE(parents, i) {
  let child = parents[i], j = i - 1;
  while (j >= 0 && ts.isParenthesizedExpression(parents[j])) { child = parents[j]; j--; }
  return j >= 0 && ts.isCallExpression(parents[j]) && parents[j].expression === child;
}

/** Browser globals used by code that runs at IMPORT time (top level, including
 *  top-level IIFE bodies and class static blocks), which would crash a React
 *  Native app on launch. Uses inside ordinary functions are fine: the app can
 *  simply never call them. */
export function importTimeGlobals(text, fileName) {
  const sf = parse(text, fileName);
  return browserGlobalRefs(sf)
    .filter(({ parents }) => {
      for (let i = parents.length - 1; i >= 0; i--) {
        // Inside a real function's body or parameters: runs only if called. A computed
        // method NAME ({ [window.x]() {} }) is evaluated when the object is created, so it counts.
        const inName = parents[i].name && parents[i + 1] === parents[i].name;
        if (isFnLike(parents[i]) && !isIIFE(parents, i) && !inName) return false;
      }
      return true;
    })
    .map(({ node }) => `line ${lineOf(sf, node.getStart(sf)) + 1}: ${node.parent.getText(sf).slice(0, 90)}`);
}
