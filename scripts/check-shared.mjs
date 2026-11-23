#!/usr/bin/env node
// Fails if any synced/generated file differs from shared.lock.json.
// Fix: undo your edit here, change the web repo instead, then `npm run sync`.
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lock = JSON.parse(readFileSync(join(ROOT, "shared.lock.json"), "utf8"));
const bad = [];
for (const [rel, want] of Object.entries(lock.files)) {
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) { bad.push(`${rel}: missing`); continue; }
  const got = createHash("sha256").update(readFileSync(abs, "utf8")).digest("hex");
  if (got !== want) bad.push(`${rel}: edited here (synced from web ${lock.webSha.slice(0, 7)})`);
}
if (bad.length) {
  console.error("check:shared FAILED. These files come from the web repo and must not be edited here:\n  " + bad.join("\n  "));
  process.exit(1);
}
console.log(`check:shared ok (${Object.keys(lock.files).length} files @ ${lock.webSha.slice(0, 7)})`);
