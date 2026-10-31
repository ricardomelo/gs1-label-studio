// Installing the studio as an app (the owner, 31 October 2026): Chrome, Edge and Samsung Internet offer it through the
// `beforeinstallprompt` event, which may come before the page is drawn, so it is caught as soon as this module loads
// (main.tsx imports it) and kept until a button asks for it. Safari has no such event: an iPhone or iPad installs from
// Share → Add to Home Screen. A page opened as an installed app runs in `display-mode: standalone`.

export interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export type InstallState = "installed" | "ready" | "ios" | "menu";

let deferred: InstallPrompt | null = null;
let installedNow = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault(); // the browser's own banner waits for the button in "More"
    deferred = event as InstallPrompt;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installedNow = true;
    notify();
  });
}

/** Whether the page runs as an installed app, or was just installed. */
export function isInstalled(): boolean {
  if (installedNow) return true;
  if (typeof window === "undefined") return false;
  const standalone = typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches;
  return standalone || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** An iPhone, iPad or iPod, where Safari installs from its Share menu only (iPadOS reports itself as a Mac with touch). */
export function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function installState(): InstallState {
  if (isInstalled()) return "installed";
  if (deferred) return "ready";
  return isIos() ? "ios" : "menu";
}

/** Shows the browser's install dialog; true when the person accepted. */
export async function install(): Promise<boolean> {
  const event = deferred;
  if (!event) return false;
  deferred = null; // the event can be used once
  await event.prompt();
  const { outcome } = await event.userChoice;
  if (outcome === "accepted") installedNow = true;
  notify();
  return outcome === "accepted";
}

export function onInstallChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
