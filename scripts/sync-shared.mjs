#!/usr/bin/env node
// Pulls the shared web modules into this repo. See PLAN.md §2.
//
//   npm run sync                      fetch karanmann137-creator/freddy-fixit@main
//   npm run sync -- --ref <sha|branch|tag>
//   npm run sync -- --locked          re-fetch the EXACT web commit in shared.lock.json and
//                                     fail if any output differs from the lock (reproducibility)
//   npm run sync -- --from ../freddy-fixit   use a local web checkout instead of fetching
//
// What it writes (and nothing else):
//   src/lib/<file>.ts              verbatim copies of SHARED, with a DO-NOT-EDIT header
//   src/kit/tokens.generated.ts    --ff-* design tokens parsed from web src/main.tsx
//   src/kit/glyphs.generated.ts    Lucide path data parsed from web src/components/Ic.tsx
//   src/lib/imageProfiles.generated.ts   compress PROFILES parsed from web imageCompress.ts
//   shared.lock.json               web sha + sha256 of every file above
//
// The web repo is the ONLY source. Never edit a synced or generated file here:
// `npm run check:shared` fails CI if you do.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { importTimeGlobals } from "./lib/source.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WEB_REPO = "https://github.com/karanmann137-creator/freddy-fixit";

// PLAN.md §2.2 "Shared verbatim". Add a file here only if it touches no
// window/document/localStorage at import time and imports only other shared
// files or a native override (supabase, myProfile, imageCompress...).
// chatUnread + bidThreads join after web prereq W2 (bus.ts).
export const SHARED = [
  "database.types", "authRead", "availability", "calgaryAreas", "chatParse",
  "checklistTemplates", "contractCopy", "contractorGuide", "dashSearch", "dismissals",
  "emailValidation", "imageSafety", "jobCode", "jobFunding", "jobQuestions",
  "jobSplit", "jobStage", "jobText", "mfa", "myProfile", "passwordStrength",
  "platformRates", "platformStatus", "priceChange", "recurrence", "respTime",
  "roleWrite", "servicePricing", "serviceTags", "stripeRequirements", "notificationRoutes",
];

const args = process.argv.slice(2);
const arg = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const locked = args.includes("--locked");
const lockPath = join(ROOT, "shared.lock.json");
const lockedLock = locked ? JSON.parse(readFileSync(lockPath, "utf8")) : null;
const ref = locked ? lockedLock.webSha : (arg("--ref") ?? "main");
let from = arg("--from");
let tmp;
process.on("exit", () => { if (tmp) rmSync(tmp, { recursive: true, force: true }); });

const git = (...a) => execFileSync("git", a, { encoding: "utf8" }).trim();

if (!from) {
  tmp = mkdtempSync(join(tmpdir(), "ff-web-"));
  // init + fetch <ref> works for a branch, a tag AND a commit sha (clone --branch can't take a sha).
  git("-C", tmp, "init", "--quiet");
  git("-C", tmp, "remote", "add", "origin", WEB_REPO);
  git("-C", tmp, "sparse-checkout", "set", "--no-cone", "/src/lib/", "/src/components/Ic.tsx", "/src/main.tsx");
  git("-C", tmp, "fetch", "--quiet", "--depth", "1", "--filter=blob:none", "origin", ref);
  git("-C", tmp, "checkout", "--quiet", "FETCH_HEAD");
  from = tmp;
}
const webSha = git("-C", from, "rev-parse", "HEAD");
const short = webSha.slice(0, 7);
const read = (p) => readFileSync(join(from, p), "utf8");
const sha256 = (s) => createHash("sha256").update(s).digest("hex");
const files = {};
const out = (rel, body) => {
  const abs = join(ROOT, rel);
  files[rel] = sha256(body);
  if (locked) return; // verify only; never touch the tree
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, body);
};

// ---------------------------------------------------------------- 1. shared lib
for (const name of SHARED) {
  const src = read(`src/lib/${name}.ts`);
  // Browser globals are fine inside a function the app never calls (e.g. notificationRoutes'
  // URL helpers, banned by check-rules), but not in a top-level statement, which runs at import.
  const hits = importTimeGlobals(src, `${name}.ts`);
  if (hits.length) throw new Error(`${name}.ts touches a browser global at import time (it would crash the app on launch): ${hits[0]}`);
  out(`src/lib/${name}.ts`,
    `// SYNCED from freddy-fixit@${short}:src/lib/${name}.ts. DO NOT EDIT HERE.\n` +
    `// Edit the web repo, then run \`npm run sync\`. See PLAN.md §2.\n` + src);
}

// ---------------------------------------------------------------- 2. tokens
// Pull --ff-* declarations out of the three theme blocks in main.tsx and resolve
// var() / rgba(var(--triplet), a) so native code gets plain values.
function block(css, selectorStart) {
  const i = css.indexOf(selectorStart);
  if (i < 0) throw new Error(`token block not found: ${selectorStart}`);
  let j = css.indexOf("{", i), depth = 0, k = j;
  for (; k < css.length; k++) {
    if (css[k] === "{") depth++;
    else if (css[k] === "}" && --depth === 0) break;
  }
  return css.slice(j + 1, k);
}
function decls(body) {
  const clean = body.replace(/\/\*[\s\S]*?\*\//g, "");
  const map = {};
  for (const m of clean.matchAll(/--ff-([a-z0-9-]+)\s*:\s*([^;]+);/g)) map[m[1]] = m[2].trim();
  return map;
}
const mainCss = read("src/main.tsx");
const dark = decls(block(mainCss, ":root {"));
const light = decls(block(mainCss, ':root[data-theme="light"] {'));
const onDark = decls(block(mainCss, ':root:not([data-theme="light"]) .ff-on-dark,'));
function resolve(theme, fallback) {
  const all = { ...fallback, ...theme };
  const r = (v, depth = 0) => {
    if (depth > 8) return v;
    return v
      .replace(/rgba\(\s*var\(--ff-([a-z0-9-]+)\)\s*,\s*([0-9.]+)\s*\)/g,
        (_, n, a) => `rgba(${r(all[n] ?? "0,0,0", depth + 1)},${a})`)
      .replace(/var\(--ff-([a-z0-9-]+)(?:\s*,\s*([^)]+))?\)/g,
        (_, n, fb) => (all[n] != null ? r(all[n], depth + 1) : (fb ?? `var(--ff-${n})`)));
  };
  return Object.fromEntries(Object.keys(theme).map(k => [k, r(theme[k])]));
}
const camel = (s) => s.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
const obj = (m) => "{\n" + Object.entries(m).map(([k, v]) => `    ${JSON.stringify(camel(k))}: ${JSON.stringify(v)},`).join("\n") + "\n  }";
const rDark = resolve(dark, {});
const rLight = resolve({ ...dark, ...light }, {});
const rOnDark = resolve({ ...dark, ...onDark }, {});
out("src/kit/tokens.generated.ts",
  `// GENERATED from freddy-fixit@${short}:src/main.tsx by scripts/sync-shared.mjs. DO NOT EDIT.\n` +
  `// Raw CSS values with var() resolved. src/kit/theme.tsx turns them into numbers/colours.\n` +
  `export const rawTokens = {\n  dark: ${obj(rDark)},\n  light: ${obj(rLight)},\n  onDark: ${obj(rOnDark)},\n} as const;\n` +
  `export type TokenName = keyof typeof rawTokens.dark;\n`);

// ---------------------------------------------------------------- 3. glyphs
const ic = read("src/components/Ic.tsx");
const need = (hay, needle, what) => { const i = hay.indexOf(needle); if (i < 0) throw new Error(`${what}: marker "${needle}" not found (did the web file change shape?)`); return i; };
const iconsAt = need(ic, "const ICONS", "Ic.tsx");
const icons = ic.slice(iconsAt, need(ic.slice(iconsAt), "\n};", "Ic.tsx ICONS end") + iconsAt);
const glyphs = {};
for (const line of icons.split("\n")) {
  const m = line.match(/^\s*("?[a-z0-9-]+"?)\s*:\s*(.+),\s*$/);
  if (!m) continue;
  const name = m[1].replace(/"/g, "");
  glyphs[name] = [...m[2].matchAll(/<(path|rect|circle|polyline|polygon|line|ellipse)\s([^>]*?)\/>/g)].map(([, tag, attrs]) =>
    [tag, Object.fromEntries([...attrs.matchAll(/([a-zA-Z-]+)="([^"]*)"/g)].map(([, k, v]) => [camel(k), v]))]);
  if (!glyphs[name].length) throw new Error(`glyph ${name}: no shapes parsed`);
}
if (Object.keys(glyphs).length === 0) throw new Error("Ic.tsx: parsed 0 glyphs");
const names = [...ic.slice(need(ic, "export type IconName", "Ic.tsx"), need(ic, "type IcProps", "Ic.tsx")).matchAll(/"([a-z0-9-]+)"/g)].map(m => m[1]);
const missing = names.filter(n => !glyphs[n]);
if (names.length === 0) throw new Error("Ic.tsx: parsed 0 IconName entries");
if (missing.length) throw new Error(`IconName entries without parsed glyphs: ${missing.join(", ")}`);
out("src/kit/glyphs.generated.ts",
  `// GENERATED from freddy-fixit@${short}:src/components/Ic.tsx (Lucide, ISC). DO NOT EDIT.\n` +
  `export type GlyphShape = [tag: "path" | "rect" | "circle" | "polyline" | "polygon" | "line" | "ellipse", attrs: Record<string, string>];\n` +
  `export const glyphs = ${JSON.stringify(glyphs, null, 1)} as const satisfies Record<string, readonly GlyphShape[]>;\n` +
  `export type IconName = keyof typeof glyphs;\n`);

// ---------------------------------------------------------------- 4. compress profiles
const comp = read("src/lib/imageCompress.ts");
const prof = comp.match(/const PROFILES[^=]*=\s*(\{[\s\S]*?\n\});/);
if (!prof) throw new Error("PROFILES not found in imageCompress.ts");
out("src/lib/imageProfiles.generated.ts",
  `// GENERATED from freddy-fixit@${short}:src/lib/imageCompress.ts. DO NOT EDIT.\n` +
  `export type CompressProfile = "photo" | "avatar" | "document";\n` +
  `export const PROFILES: Record<CompressProfile, { maxDim: number; quality: number }> = ${prof[1]};\n`);

// ---------------------------------------------------------------- lock
if (locked) {
  const diff = [...new Set([...Object.keys(files), ...Object.keys(lockedLock.files)])].filter((k) => files[k] !== lockedLock.files[k]);
  if (diff.length) { console.error(`--locked: output differs from shared.lock.json for:\n  ${diff.join("\n  ")}`); process.exit(1); }
  console.log(`--locked ok: ${Object.keys(files).length} files reproduce exactly from freddy-fixit@${short}`);
  process.exit(0);
}
// No date in the lock: it changes only when the synced content changes.
writeFileSync(lockPath, JSON.stringify({ webRepo: WEB_REPO, webSha, files }, null, 2) + "\n");
console.log(`synced ${Object.keys(files).length} files from freddy-fixit@${short}`);
