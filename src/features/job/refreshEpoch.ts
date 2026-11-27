// One "re-read the job's side panels" signal, shared by both roles' job screens.
//
// The panels that load their own data — the price previews (pricePreview.ts) and
// the two ContractPanels — key their reads on the job id and the job's columns. A
// pull-to-refresh re-reads the job row, but when those columns didn't change their
// key doesn't either, so a FAILED panel read could never recover by pulling, even
// though its copy says "pull down to try again" (gate review 2026-11-27). Every
// pull, and every action that re-reads the job, bumps this epoch; the panels put it
// in their key and read again.
import { useSyncExternalStore } from "react";

let epoch = 0;
const subs = new Set<() => void>();

/** Ask every mounted job panel to read again. */
export function bumpJobReads(): void {
  epoch += 1;
  subs.forEach((f) => f());
}

const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
const snapshot = () => epoch;

/** The current epoch: put it in a read's key (or effect deps) to re-read on every bump. */
export function useJobReadsEpoch(): number {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
