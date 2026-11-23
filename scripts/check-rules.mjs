#!/usr/bin/env node
// Layer 1 of the review gates (PLAN.md §8a): mechanical rules, on every push.
// Each rule maps to a real failure on the web platform. Don't weaken one to get
// a build through: fix the code. A line that genuinely needs an exception carries
// `rule-ok: <reason>` (3+ words) in a comment on that line.
//
// Built on the TypeScript parser (scripts/lib/source.mjs), so strings, regexes,
// JSX text and comments can't fool it. Only files listed in shared.lock.json are
// skipped. They are web copies, reviewed in the web repo and proven unedited
// by check:shared.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { blankComments, browserGlobalRefs, lineOf, parse, walk } from "./lib/source.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");
const LOCKED = new Set(Object.keys(JSON.parse(readFileSync(join(ROOT, "shared.lock.json"), "utf8")).files));

function walkDir(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walkDir(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
}

const problems = [];
const RULE_OK = /rule-ok:\s*\S+(\s+\S+){2,}/;

// ---------------------------------------------------------------- rule tables
const LINE_RULES = [ // run on the comment-blanked text, line by line
  { rule: "Use .maybeSingle(), never .single() (web rule: .single() errors on zero rows)", test: (l) => /\.single\(/.test(l) },
  { rule: "No `as any` on a Supabase call: the typed client is the point", test: (l) => /(supabase\.|\.rpc\(|functions\.invoke)/.test(l) && /\bas any\b/.test(l) },
  { rule: "No colour literal outside the tokens: use useTheme().t / rgba()",
    test: (l) => /(["'`])#[0-9a-fA-F]{3,8}\1|\b(rgba?|hsla?)\(\s*\d/.test(l), skip: (rel) => rel === "src/kit/theme.tsx" },
  { rule: "Consumer wording: say \"held securely\", never \"escrow\"", test: (l) => /escrow/i.test(l) },
];

// Money: a rate-looking number in a statement whose identifiers include a money word.
// Identifiers are split into words (platformFee → platform, fee; FEE_RATE → fee, rate),
// so "center", "accent" or "percentage" never count.
const MONEY_WORDS = new Set(["fee", "fees", "rate", "rates", "commission", "payout", "payouts", "amount", "price",
  "total", "cents", "deposit", "balance", "charge", "earn", "earned", "earnings", "subtotal", "tax", "net"]);
const RATE_VALUES = new Set([0.93, 0.07, 0.03, 0.4]);
const words = (id) => id.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase().split(/[^a-z]+/).filter(Boolean);

// Kit sizes: a non-zero number literal as a style value, JSX prop or default param in src/kit.
// These keys are not sizes, so numbers are fine there. <Txt size> is a rem type scale.
const NOT_A_SIZE = new Set(["flex", "flexGrow", "flexShrink", "opacity", "zIndex", "shadowOpacity", "aspectRatio",
  "numberOfLines", "duration", "delay", "ms", "after", "stopOpacity", "scale", "rotate", "lh", "ls", "damping", "stiffness", "mass", "max", "lines"]);

// ---------------------------------------------------------------- per file
const files = walkDir(SRC)
  .map((abs) => ({ rel: relative(ROOT, abs), text: readFileSync(abs, "utf8") }))
  .filter((f) => !LOCKED.has(f.rel));

for (const f of files) {
  const sf = parse(f.text, f.rel);
  const raw = f.text.split("\n");
  const code = blankComments(f.text, sf).split("\n");
  const ok = (line) => RULE_OK.test(raw[line] ?? "");
  const report = (line, rule) => { if (!ok(line)) problems.push(`${f.rel}:${line + 1}  ${rule}\n      ${(raw[line] ?? "").trim().slice(0, 140)}`); };
  const at = (node) => lineOf(sf, node.getStart(sf));
  const inKit = f.rel.startsWith("src/kit/") && f.rel !== "src/kit/theme.tsx";

  raw.forEach((l, i) => { if (/rule-ok:/.test(l) && !RULE_OK.test(l)) problems.push(`${f.rel}:${i + 1}  rule-ok needs a reason (3+ words)\n      ${l.trim()}`); });
  code.forEach((l, i) => { for (const r of LINE_RULES) if ((!r.skip || !r.skip(f.rel)) && r.test(l)) report(i, r.rule); });

  for (const { node } of browserGlobalRefs(sf)) report(at(node), "No browser globals in app code (window/document/localStorage): use src/platform");

  walk(sf, (n, parents) => {
    // Banned imports (they read window.location)
    if (ts.isImportSpecifier(n) && /^(readDashNavFromUrl|clearDashNavFromUrl)$/.test((n.propertyName ?? n.name).text)) {
      report(at(n), "Banned import: readDashNavFromUrl/clearDashNavFromUrl read window.location. Use platform/links.ts");
    }

    // onAuthStateChange: no await, no supabase.* call inside the callback (auth-lock deadlock)
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === "onAuthStateChange") {
      let bad = false;
      n.arguments.forEach((arg) => walk(arg, (m) => {
        if (ts.isAwaitExpression(m)) bad = true;
        if (ts.isCallExpression(m) && /^supabase\./.test(m.expression.getText(sf))) bad = true;
      }));
      if (bad) report(at(n), "No Supabase call or await inside onAuthStateChange: it deadlocks the auth lock. Set a flag; react to it elsewhere");
    }

    // DeadEnd retry={false} must carry alt= (a refusal needs a way out)
    if ((ts.isJsxSelfClosingElement(n) || ts.isJsxOpeningElement(n)) && n.tagName.getText(sf) === "DeadEnd") {
      const attrs = n.attributes.properties.filter(ts.isJsxAttribute);
      const retry = attrs.find((a) => a.name.getText(sf) === "retry");
      let v = retry?.initializer && ts.isJsxExpression(retry.initializer) ? retry.initializer.expression : undefined;
      while (v && (ts.isAsExpression(v) || ts.isParenthesizedExpression(v))) v = v.expression;
      if (v && v.kind === ts.SyntaxKind.FalseKeyword && !attrs.some((a) => a.name.getText(sf) === "alt")) {
        report(at(n), "DeadEnd retry={false} needs alt= (a way out)");
      }
    }

    // Money rates
    const num = ts.isNumericLiteral(n) ? Number(n.text) : null;
    const pct = ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.SlashToken && ts.isNumericLiteral(n.left) &&
      ts.isNumericLiteral(n.right) && n.right.text === "100" && ["93", "7", "3", "40"].includes(n.left.text);
    if ((num !== null && RATE_VALUES.has(num)) || pct) {
      const stmt = [...parents].reverse().find((a) => ts.isStatement(a) || ts.isPropertyAssignment(a) || ts.isJsxAttribute(a)) ?? n;
      const ids = [];
      walk(stmt, (m) => { if (ts.isIdentifier(m)) ids.push(m.text); });
      if (ids.some((id) => words(id).some((w) => MONEY_WORDS.has(w)))) report(at(n), "No hard-coded money rate: rates come from platformRates.ts / get_job_fee");
    }

    // Kit sizes
    if (inKit && ts.isNumericLiteral(n) && Number(n.text) !== 0) {
      let i = parents.length - 1, child = n;
      if (ts.isPrefixUnaryExpression(parents[i])) { child = parents[i]; i--; }
      const host = parents[i];
      let key = null;
      if (host && ts.isPropertyAssignment(host) && host.initializer === child) key = host.name.getText(sf);
      else if (host && (ts.isParameter(host) || ts.isBindingElement(host)) && host.initializer === child) key = host.name.getText(sf);
      else if (host && ts.isJsxExpression(host) && ts.isJsxAttribute(parents[i - 1])) {
        const attr = parents[i - 1], el = parents[i - 3];
        const tag = el && (ts.isJsxSelfClosingElement(el) || ts.isJsxOpeningElement(el)) ? el.tagName.getText(sf) : "";
        key = tag === "Txt" && attr.name.getText(sf) === "size" ? null : attr.name.getText(sf);
      }
      if (key && !NOT_A_SIZE.has(key)) report(at(n), `No literal size in the kit (${key}): use t.* or ui.* (kit/theme.tsx)`);
    }
  });
}

// ---------------------------------------------------------------- mounts
// MIN_COUNTS: things whose absence would fail SILENTLY (web check_mounts.py's test:
// "if this line vanished, would anything error?" If not, it belongs here).
// Counted on comment-blanked text, so a commented-out mount doesn't count. Grows per phase.
const MOUNTS = [
  { file: "src/app/_layout.tsx", needle: "SplashScreen.hideAsync", min: 1, why: "without it the app sits on the splash forever, with no error" },
  { file: "src/app/_layout.tsx", needle: "fontError", min: 1, why: "a font that fails to load must not hold the splash" },
  { file: "src/app/_layout.tsx", needle: "<ConfirmHost", min: 1, why: "without it every askConfirm() resolves false: Pay/Delete buttons silently do nothing" },
  { file: "src/app/_layout.tsx", needle: "<ToastHost", min: 1, why: "without it notify() confirmations vanish silently" },
];
for (const m of MOUNTS) {
  let text = "";
  try { const t = readFileSync(join(ROOT, m.file), "utf8"); text = blankComments(t, parse(t, m.file)); } catch { /* missing file = 0 */ }
  const n = text.split(m.needle).length - 1;
  if (n < m.min) problems.push(`${m.file}  missing mount "${m.needle}" (need ${m.min}, found ${n}): ${m.why}`);
}

if (problems.length) {
  console.error(`check:rules FAILED (${problems.length}):\n  ` + problems.join("\n  "));
  process.exit(1);
}
console.log(`check:rules ok (${files.length} files, ${MOUNTS.length} mounts)`);
