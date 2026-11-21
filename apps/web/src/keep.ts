// What this browser keeps for its user: GS1's GCP length table, loaded once (about 9 MB of XML, kept as compact text),
// and the Check Studio's history (history.ts). IndexedDB, as localStorage is too small; it may be unavailable (private
// windows, blocked storage), and then what was loaded only lasts until the page is closed.

import { stored } from "./channel.ts";

const DATABASE = stored("gs1-label-studio");
const STORE = "kept";
/** Version 2 (backlog 7.1 j) adds the history's stores; the upgrade leaves version 1's store and what it holds. */
const VERSION = 2;

/** Opens the application's database, creating or upgrading its stores. */
export function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      if (!db.objectStoreNames.contains("readings")) db.createObjectStore("readings", { keyPath: "id", autoIncrement: true });
      if (!db.objectStoreNames.contains("sessions")) db.createObjectStore("sessions", { keyPath: "id", autoIncrement: true });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

const open = openDatabase;

export async function keep(name: string, value: string | null): Promise<boolean> {
  try {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE, "readwrite");
      const store = transaction.objectStore(STORE);
      if (value === null) store.delete(name);
      else store.put(value, name);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
    return true;
  } catch {
    return false;
  }
}

export async function kept(name: string): Promise<string | null> {
  try {
    const db = await open();
    const value = await new Promise<string | null>((resolve, reject) => {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).get(name);
      request.onsuccess = () => resolve((request.result as string | undefined) ?? null);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return value;
  } catch {
    return null;
  }
}

/** The text of a file, gzip or plain (GS1's list may come compressed). */
export async function fileText(file: File): Promise<string> {
  const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
  if (head[0] === 0x1f && head[1] === 0x8b) {
    const stream = file.stream().pipeThrough(new DecompressionStream("gzip"));
    return new Response(stream).text();
  }
  return file.text();
}
