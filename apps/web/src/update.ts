// New versions found by themselves (backlog 6.1). The service worker (offline.ts) installs a new release and takes
// over at once (`skipWaiting`, `clients.claim`), but a page already open — above all an installed app brought back
// from the background — keeps the release it was loaded with. So the page asks for a new worker when it opens (the
// browser checks the worker's file at each registration) and whenever it comes back to the screen; when a new worker
// takes over a page that already had one, a new release is there, and the page offers to reload (App.tsx's bar).
// Reloading loses nothing: the work in progress is kept for the next visit (lastwork.ts). A first visit's worker also
// takes over the page, but that is no new release.

let ready = false;
const listeners = new Set<() => void>();

/** Whether a new release has taken over this page since it was loaded. */
export function updateReady(): boolean {
  return ready;
}

/** Calls `listener` when a new release is ready; returns the function that stops it. */
export function onUpdateReady(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Registers the service worker at `url` and watches for new releases. */
export function watchUpdates(url: string, container: ServiceWorkerContainer = navigator.serviceWorker, doc: Document = document): void {
  let controlled = container.controller !== null;
  container.addEventListener("controllerchange", () => {
    if (controlled && !ready) {
      ready = true;
      listeners.forEach((listener) => listener());
    }
    controlled = true;
  });
  container
    .register(url)
    .then((registration) => {
      const check = () => registration.update().catch(() => undefined); // offline: asked again on the next return
      doc.addEventListener("visibilitychange", () => {
        if (doc.visibilityState === "visible") void check();
      });
    })
    .catch((error: unknown) => console.warn(error));
}
