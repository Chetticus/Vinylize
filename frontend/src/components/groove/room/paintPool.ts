/**
 * A small pool of Web Workers for the 3D tab's heavy, pure pixel work: the
 * room's painters (pixels.ts) and the record's groove strips
 * (vinylStrips.ts).
 *
 * Jobs are spread across up to four workers and run in parallel; finished
 * buffers are transferred (not copied) back to the page. Workers are torn
 * down once their queue is empty, so no threads idle after loading. If
 * workers are unavailable, jobs run on the main thread one per macrotask —
 * slower, but the page can still paint between them.
 */

import type * as pixels from "./pixels";
import { WORKER_FUNCTIONS, type JobName, type PainterName } from "./workerFunctions";

export type { JobName, PainterName };
type Job = [JobName, unknown[]];

function runHere<T>([name, args]: Job): T {
  return (WORKER_FUNCTIONS[name] as (...a: unknown[]) => T)(...args);
}

function spawn(count: number): Worker[] {
  const workers: Worker[] = [];
  try {
    for (let i = 0; i < count; i++) {
      workers.push(new Worker(new URL("./paint.worker.ts", import.meta.url), { type: "module" }));
    }
  } catch {
    workers.forEach((w) => w.terminate());
    return [];
  }
  return workers;
}

let nextId = 1;

export function runJobs<T>(jobs: Job[]): Promise<T>[] {
  if (jobs.length === 0) return [];
  const workers = spawn(Math.max(1, Math.min(4, (navigator.hardwareConcurrency ?? 4) - 1, jobs.length)));

  if (workers.length === 0) {
    let chain: Promise<unknown> = Promise.resolve();
    return jobs.map((job) => {
      const result = chain.then(() => new Promise<void>((r) => setTimeout(r, 0))).then(() => runHere<T>(job));
      chain = result;
      return result;
    });
  }

  let remaining = jobs.length;
  const settle = () => {
    if (--remaining === 0) workers.forEach((w) => w.terminate());
  };
  return jobs.map((job, i) => {
    const worker = workers[i % workers.length];
    const id = nextId++;
    return new Promise<T>((resolve) => {
      const cleanup = () => {
        worker.removeEventListener("message", onMessage);
        worker.removeEventListener("error", onError);
        settle();
      };
      const onMessage = (e: MessageEvent<{ id: number; result?: T }>) => {
        if (e.data.id !== id) return;
        cleanup();
        resolve(e.data.result ?? runHere<T>(job));
      };
      const onError = () => {
        cleanup();
        resolve(runHere<T>(job));
      };
      worker.addEventListener("message", onMessage);
      worker.addEventListener("error", onError);
      worker.postMessage({ id, name: job[0], args: job[1] });
    });
  });
}

export function paintInWorkers(jobs: Array<[PainterName, unknown[]]>): Promise<pixels.PixelSet>[] {
  return runJobs<pixels.PixelSet>(jobs);
}

export function runInWorker<T>(name: JobName, args: unknown[]): Promise<T> {
  return runJobs<T>([[name, args]])[0];
}
