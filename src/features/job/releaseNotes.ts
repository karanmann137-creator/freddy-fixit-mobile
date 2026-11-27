// A release that didn't go through after the client confirmed (web `releaseNote`).
// It is the one state in which money has been taken and not yet reached anybody,
// so web keeps it on screen after the toast and it outranks the other attention
// rows. Web holds it in page state for the session; the app's job screen and
// Requests tab are separate screens, so it lives here, in memory, for the session.
import { useEffect, useState } from "react";
import { emit, on } from "@/lib/bus";

export type ReleaseNote = { kind: "balance" | "payout" | "delayed"; text: string };

const RELEASE_NOTE_EVENT = "ff:release-note";
const notes = new Map<string, ReleaseNote>();

export function setReleaseNote(jobId: string, note: ReleaseNote | null) {
  if (note) notes.set(jobId, note); else notes.delete(jobId);
  emit(RELEASE_NOTE_EVENT, jobId);
}

export function getReleaseNote(jobId: string | null | undefined): ReleaseNote | null {
  return jobId ? notes.get(jobId) ?? null : null;
}

/** The note for one job, re-rendering when it changes. */
export function useReleaseNote(jobId: string | null | undefined): ReleaseNote | null {
  const [, bump] = useState(0);
  useEffect(() => on(RELEASE_NOTE_EVENT, () => bump((n) => n + 1)), []);
  return getReleaseNote(jobId);
}
