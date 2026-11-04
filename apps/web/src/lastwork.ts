import { readWork, workFile, type Work } from "@gs1-label-studio/core";

// The last work kept in this browser and offered on the next visit (backlog 4.3 (c), mock-up A of two, 4 November
// 2026). It is the work file Save downloads, kept in IndexedDB (keep.ts) as the work changes; the next visit asks
// whether to continue it, and never brings it back unasked. A first visit's work, or Start over's, is not kept: there
// is then nothing to offer.

/** Its name among what this browser keeps. */
export const LAST_WORK = "work";

export interface KeptWork {
  work: Work;
  /** When it was kept, as its file says; null if the file has no time that can be read. */
  saved: Date | null;
}

/** The work kept, read back; null when there is none, or when it cannot be read (damaged, or from a newer studio). */
export function keptWork(text: string | null): KeptWork | null {
  let work: Work;
  let time: unknown;
  try {
    work = readWork(text!);
    time = (JSON.parse(text!) as { saved?: unknown }).saved;
  } catch {
    return null;
  }
  const saved = typeof time === "string" ? new Date(time) : null;
  return { work, saved: saved && !Number.isNaN(saved.getTime()) ? saved : null };
}

/** The work as compared with a first visit's: its file without the time it was saved. */
export function workKey(work: Work): string {
  return JSON.stringify(work);
}

/** What to keep for the work now: its file, or null (keep nothing) when it is still the first visit's work. */
export function workToKeep(work: Work, start: string, saved: Date = new Date()): string | null {
  return workKey(work) === start ? null : workFile(work, saved);
}

/** A line that tells the work kept from another: its key's element string, if one was typed. */
export function workSummary(work: Work): string {
  const { key, value } = work.identification;
  return value.trim() ? `(${key}) ${value.trim()}` : "";
}
