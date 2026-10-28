// What this browser keeps for its user: GS1's GCP length table, loaded once (about 9 MB of XML, kept as compact text).
// IndexedDB, as localStorage is too small; it may be unavailable (private windows, blocked storage), and then the
// table only lasts until the page is closed.

const DATABASE = "gs1-label-studio";
const STORE = "kept";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

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
