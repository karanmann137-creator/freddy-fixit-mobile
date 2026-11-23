#!/usr/bin/env node
// Layer 1 of the review gates (PLAN.md §8a): mechanical rules, on every push.
// Each rule maps to a real failure on the web platform. Don't weaken one to get
// a build through: fix the code. A line that genuinely needs an exception carries
// `rule-ok: <reason>` (a reason of at least a few words) in a comment on that line.
//
// Only files listed in shared.lock.json are skipped. They are web copies,
// reviewed in the web repo and proven unedited by check:shared. A
// "// SYNCED from" header on any other file buys nothing.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");
const LOCKED = new Set(Object.keys(JSON.parse(readFileSync(join(ROOT, "shared.lock.json"), "utf8")).files));

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
}

/** Remove // and /* *\/ comments, keeping string contents and line breaks.
 *  A `//` inside a string ("https://…") is NOT a comment. */
export function stripComments(src) {
  let out = "", i = 0, q = null;
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (q) {
      out += c;
      if (c === "\\") { out += n ?? ""; i += 2; continue; }
      if (c === q) q = null;
      i++; continue;
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

const files = walk(SRC)
  .map((abs) => ({ abs, rel: relative(ROOT, abs), text: readFileSync(abs, "utf8") }))
  .filter((f) => !LOCKED.has(f.rel));

const problems = [];
const report = (f, i, rule, line) => problems.push(`${f.rel}:${i + 1}  ${rule}\n      ${line.trim().slice(0, 140)}`);
const RULE_OK = /rule-ok:\s*\S+(\s+\S+){2,}/; // needs a reason of 3+ words

const MONEY_WORD = /\b(fee|fees|rate|commission|payout|amount|price|total|cents|deposit|balance|charge|earn\w*|subtotal|tax)\b/i;
const LINE_RULES = [
  { rule: "Use .maybeSingle(), never .single() (web rule: .single() errors on zero rows)", test: (l) => /\.single\(/.test(l) },
  { rule: "No `as any` on a Supabase call: the typed client is the point", test: (l) => /(supabase\.|\.rpc\(|functions\.invoke)/.test(l) && /\bas any\b/.test(l) },
  { rule: "No colour literal outside the tokens: use useTheme().t / rgba()",
    test: (l) => /(["'`])#[0-9a-fA-F]{3,8}\1|\b(rgba?|hsla?)\(\s*\d/.test(l), skip: (f) => /src\/kit\/theme\.tsx$/.test(f.rel) },
  { rule: "No hard-coded money rate: rates come from platformRates.ts / get_job_fee",
    test: (l) => MONEY_WORD.test(l) && /(^|[^\w.])0?\.(93|07|03|40?)\b|\b(93|7|3|40)\s*\/\s*100\b/.test(l) },
  { rule: "No browser globals in app code (window/document/localStorage): use src/platform", test: (l) => /\b(window|document|localStorage|sessionStorage)\./.test(l) },
  { rule: "Banned import: readDashNavFromUrl/clearDashNavFromUrl read window.location. Use platform/links.ts", test: (l) => /\b(readDashNavFromUrl|clearDashNavFromUrl)\b/.test(l) },
  { rule: "Consumer wording: say \"held securely\", never \"escrow\"", test: (l) => /escrow/i.test(l) },
];

for (const f of files) {
  const raw = f.text.split("\n");
  const code = stripComments(f.text);
  const lines = code.split("\n");
  lines.forEach((l, i) => {
    if (/rule-ok:/.test(raw[i]) && !RULE_OK.test(raw[i])) { report(f, i, "rule-ok needs a reason (3+ words)", raw[i]); return; }
    if (RULE_OK.test(raw[i])) return;
    for (const r of LINE_RULES) if ((!r.skip || !r.skip(f)) && r.test(l)) report(f, i, r.rule, raw[i]);
  });

  // No Supabase work inside an onAuthStateChange callback: it deadlocks the auth lock.
  for (const m of code.matchAll(/onAuthStateChange\s*\(/g)) {
    let depth = 0, j = m.index + m[0].length - 1;
    for (; j < code.length; j++) {
      if (code[j] === "(") depth++;
      else if (code[j] === ")" && --depth === 0) break;
    }
    const body = code.slice(m.index, j);
    if (/supabase\.(from|rpc|functions|storage|auth\.(getUser|getSession|refreshSession))|\bawait\b/.test(body)) {
      const line = code.slice(0, m.index).split("\n").length - 1;
      report(f, line, "No Supabase call or await inside onAuthStateChange: it deadlocks the auth lock. Set a flag; react to it elsewhere", "onAuthStateChange(...)");
    }
  }

  // DeadEnd with retry={false} must carry alt=: a refusal with no way out is the
  // exact bug DeadEnd exists to prevent. (The type enforces it; this catches a cast.)
  for (const m of code.matchAll(/<DeadEnd\b([^>]*)\/?>/g)) {
    if (/retry=\{\s*false\s*\}/.test(m[1]) && !/\balt=/.test(m[1])) {
      report(f, code.slice(0, m.index).split("\n").length - 1, "DeadEnd retry={false} needs alt= (a way out)", m[0]);
    }
  }
}

// ---------------------------------------------------------------- mounts
// MIN_COUNTS: things whose absence would fail SILENTLY (web check_mounts.py's test:
// "if this line vanished, would anything error?" If not, it belongs here).
// Counted with comments stripped, so a commented-out mount doesn't count.
// Grows per phase.
const MOUNTS = [
  { file: "src/app/_layout.tsx", needle: "SplashScreen.hideAsync", min: 1, why: "without it the app sits on the splash forever, with no error" },
  { file: "src/app/_layout.tsx", needle: "fontError", min: 1, why: "a font that fails to load must not hold the splash" },
  { file: "src/app/_layout.tsx", needle: "<ConfirmHost", min: 1, why: "without it every askConfirm() resolves false: Pay/Delete buttons silently do nothing" },
  { file: "src/app/_layout.tsx", needle: "<ToastHost", min: 1, why: "without it notify() confirmations vanish silently" },
];
for (const m of MOUNTS) {
  let text = "";
  try { text = stripComments(readFileSync(join(ROOT, m.file), "utf8")); } catch { /* missing file = 0 */ }
  const n = text.split(m.needle).length - 1;
  if (n < m.min) problems.push(`${m.file}  missing mount "${m.needle}" (need ${m.min}, found ${n}): ${m.why}`);
}

if (problems.length) {
  console.error(`check:rules FAILED (${problems.length}):\n  ` + problems.join("\n  "));
  process.exit(1);
}
console.log(`check:rules ok (${files.length} files, ${MOUNTS.length} mounts)`);
