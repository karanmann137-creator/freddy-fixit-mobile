#!/usr/bin/env node
// Layer 1 of the review gates (PLAN.md §8a): mechanical rules, on every push.
// Each rule below maps to a real failure on the web platform. Do not weaken one
// to get a build through: fix the code. A line that genuinely needs an exception
// carries `rule-ok: <reason>` in a comment on the same line, and the reason is
// reviewed like code.
//
// Synced (`// SYNCED from`) and generated (`// GENERATED from`) files are skipped:
// they are reviewed in the web repo, and check:shared already proves they're unedited.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
}

const files = walk(SRC)
  .map((abs) => ({ abs, rel: relative(ROOT, abs), text: readFileSync(abs, "utf8") }))
  .filter((f) => !/^\/\/ (SYNCED|GENERATED) from /.test(f.text));

const problems = [];
const report = (f, i, rule, line) => problems.push(`${f.rel}:${i + 1}  ${rule}\n      ${line.trim().slice(0, 140)}`);

// Strip a trailing // comment (crudely, but strings with // in them are rare here).
const code = (line) => line.replace(/\/\/.*$/, "");
const isComment = (line) => /^\s*(\/\/|\*|\/\*)/.test(line);

const LINE_RULES = [
  { rule: "Use .maybeSingle(), never .single() (web rule: .single() errors on zero rows)", test: (l) => /\.single\(/.test(code(l)) },
  { rule: "No `as any` on a Supabase call: the typed client is the point", test: (l) => /(supabase\.|\.rpc\(|functions\.invoke)/.test(code(l)) && /as any/.test(code(l)) },
  { rule: "No colour literal outside the tokens: use useTheme().t / rgba()", test: (l) => /#[0-9a-fA-F]{3,8}\b|\brgba?\(\s*\d/.test(code(l)), skip: (f) => /src\/kit\/theme\.tsx$/.test(f.rel) },
  { rule: "No hard-coded money rate: rates come from platformRates.ts / get_job_fee", test: (l) => /\*\s*0?\.(93|07|03|4|40)\b|\b0?\.(93|07|03)\s*\*/.test(code(l)) },
  { rule: "No browser globals in app code (window/document/localStorage): use src/platform", test: (l) => /\b(window|document|localStorage|sessionStorage)\./.test(code(l)) },
  { rule: "Banned import: readDashNavFromUrl/clearDashNavFromUrl read window.location. Use platform/links.ts", test: (l) => /\b(readDashNavFromUrl|clearDashNavFromUrl)\b/.test(code(l)) },
  { rule: "Consumer wording: say \"held securely\", never \"escrow\"", test: (l) => /escrow/i.test(l) && !isComment(l) },
];

for (const f of files) {
  const lines = f.text.split("\n");
  lines.forEach((l, i) => {
    if (/rule-ok:/.test(l) || isComment(l)) return;
    for (const r of LINE_RULES) if ((!r.skip || !r.skip(f)) && r.test(l)) report(f, i, r.rule, l);
  });

  // No Supabase work inside an onAuthStateChange callback: it deadlocks the auth lock.
  for (const m of f.text.matchAll(/onAuthStateChange\s*\(/g)) {
    let depth = 0, j = m.index + m[0].length - 1;
    for (; j < f.text.length; j++) {
      if (f.text[j] === "(") depth++;
      else if (f.text[j] === ")" && --depth === 0) break;
    }
    const body = f.text.slice(m.index, j);
    if (/supabase\.(from|rpc|functions|storage|auth\.(getUser|getSession|refreshSession))|\bawait\b/.test(body) && !/rule-ok:/.test(body)) {
      const line = f.text.slice(0, m.index).split("\n").length - 1;
      report(f, line, "No Supabase call or await inside onAuthStateChange: it deadlocks the auth lock. Set a flag; react to it elsewhere", "onAuthStateChange(...)");
    }
  }
}

// ---------------------------------------------------------------- mounts
// Things whose absence would fail SILENTLY (web check_mounts.py's rule: "if this
// line vanished, would anything error?" If not, it belongs here). Grows per phase.
const MOUNTS = [
  { file: "src/app/_layout.tsx", needle: "SplashScreen.hideAsync", min: 1, why: "without it the app sits on the splash forever, with no error" },
  { file: "src/app/_layout.tsx", needle: "fontError", min: 1, why: "a font that fails to load must not hold the splash" },
  { file: "src/app/_layout.tsx", needle: "<ConfirmHost", min: 1, why: "without it every askConfirm() resolves false: Pay/Delete buttons silently do nothing" },
  { file: "src/app/_layout.tsx", needle: "<ToastHost", min: 1, why: "without it notify() confirmations vanish silently" },
];
for (const m of MOUNTS) {
  let text = "";
  try { text = readFileSync(join(ROOT, m.file), "utf8"); } catch { /* missing file = 0 */ }
  const n = text.split(m.needle).length - 1;
  if (n < m.min) problems.push(`${m.file}  missing mount "${m.needle}" (need ${m.min}, found ${n}): ${m.why}`);
}

if (problems.length) {
  console.error(`check:rules FAILED (${problems.length}):\n  ` + problems.join("\n  "));
  process.exit(1);
}
console.log(`check:rules ok (${files.length} files, ${MOUNTS.length} mounts)`);
