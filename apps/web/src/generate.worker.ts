/// <reference lib="webworker" />
import { generateBatch, HriFont, type BatchRequest, type BatchRow } from "@gs1-label-studio/core";
import fontUrl from "@gs1-label-studio/core/assets/fonts/LiberationSans-Regular.ttf?url";

// Generating every row away from the page (backlog 2.5): the editor stays usable, shows the progress and can stop the
// work by ending this worker.

export type GenerateMessage =
  | { type: "progress"; done: number; total: number }
  | { type: "done"; zip: Uint8Array<ArrayBuffer>; generated: number; left: number }
  | { type: "error"; message: string };

declare const self: DedicatedWorkerGlobalScope;
let font: Promise<HriFont> | null = null;

self.onmessage = async (event: MessageEvent<{ rows: BatchRow[]; request: BatchRequest }>) => {
  const post = (message: GenerateMessage, transfer: Transferable[] = []) => self.postMessage(message, transfer);
  try {
    font ??= fetch(fontUrl).then((response) => response.arrayBuffer()).then((bytes) => HriFont.fromBytes(bytes));
    const { rows, request } = event.data;
    const result = await generateBatch(rows, request, await font, (done, total) => post({ type: "progress", done, total }));
    post({ type: "done", zip: result.zip, generated: result.generated, left: result.left }, [result.zip.buffer]);
  } catch (error) {
    post({ type: "error", message: error instanceof Error ? error.message : String(error) });
  }
};
