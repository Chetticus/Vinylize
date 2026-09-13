/**
 * Worker entry: runs one named pure job per message and transfers any pixel
 * buffers in the result back to the page. See paintPool.ts.
 */

import { WORKER_FUNCTIONS, type JobName } from "./workerFunctions";

interface Scope {
  onmessage: ((e: MessageEvent<{ id: number; name: JobName; args: unknown[] }>) => void) | null;
  postMessage(message: unknown, transfer: Transferable[]): void;
}

const scope = self as unknown as Scope;

scope.onmessage = (e) => {
  const { id, name, args } = e.data;
  try {
    const result = (WORKER_FUNCTIONS[name] as (...a: unknown[]) => Record<string, unknown>)(...args);
    const transfer = Object.values(result)
      .filter((v): v is Uint8ClampedArray => v instanceof Uint8ClampedArray)
      .map((b) => b.buffer as ArrayBuffer);
    scope.postMessage({ id, result }, transfer);
  } catch {
    // The page runs this job itself if the worker can't.
    scope.postMessage({ id }, []);
  }
};
