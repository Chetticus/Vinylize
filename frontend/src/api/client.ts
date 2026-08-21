/**
 * Typed fetch wrapper for the backend API.
 *
 * All paths are relative: Vite's dev server proxies /api to the Python
 * engine (see vite.config.ts), so in normal use the browser talks to one
 * origin and there is no CORS involved.
 *
 * Error handling deserves a note, because "Failed to fetch" is the least
 * useful message a user can be shown. There are three distinct failures and
 * they need three distinct explanations:
 *
 *   1. fetch() throws TypeError
 *      Nothing answered at all. The page is not being served by the dev
 *      server — it has stopped, or the file was opened from disk / another
 *      origin, so /api resolves nowhere. This is the case that produced the
 *      raw "Failed to fetch".
 *
 *   2. 5xx with an EMPTY body
 *      The dev server is up and the proxy tried, but nothing is listening on
 *      the engine's port. Vite answers 500 text/plain with no body. So: the
 *      Python side is not running.
 *
 *   3. 4xx/5xx WITH a body (FastAPI sends {"detail": ...})
 *      A real API error. Show what the server actually said.
 */

import type {
  AnalyzeResponse,
  GeometryMeta,
  GrooveGeometry,
  GrooveWindow,
  ProcessConfig,
  ProcessResponse,
} from "../types/api";

const START_BOTH = 'run "npm run dev" in the frontend folder — it starts both halves';
const START_ENGINE =
  'start it with "uvicorn app.main:app --port 8000" from the backend folder, or ' + START_BOTH;

/** Raised when the API cannot be reached at all — as opposed to answering
 * with an error. Callers use this to show setup help rather than a bug. */
export class ApiUnreachableError extends Error {
  constructor(
    message: string,
    /** Which half of the stack is missing, for the UI to explain. */
    readonly missing: "web" | "engine",
  ) {
    super(message);
    this.name = "ApiUnreachableError";
  }
}

/** fetch + the diagnosis described above. */
async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    // (1) nothing answered — the page is not being served by the dev server.
    throw new ApiUnreachableError(
      "Can't reach the app server. Vinylize has to be opened through its dev " +
        `server rather than from a file — ${START_BOTH}, then reload this page.`,
      "web",
    );
  }

  if (res.ok) return res;

  const body = await res.text().catch(() => "");
  if (res.status >= 500 && body.trim() === "") {
    // (2) the proxy could not reach the Python engine.
    throw new ApiUnreachableError(
      `The audio engine isn't running, so there is nothing to cut a record with — ${START_ENGINE}.`,
      "engine",
    );
  }

  // (3) a real error from the API.
  let detail = `${res.status} ${res.statusText}`;
  try {
    const parsed = JSON.parse(body) as { detail?: string };
    if (parsed.detail) detail = parsed.detail;
  } catch {
    if (body.trim()) detail = body.slice(0, 300);
  }
  throw new Error(detail);
}

/** Cheap liveness probe used at startup; never throws. */
export async function checkApiHealth(): Promise<
  { ok: true } | { ok: false; message: string; missing: "web" | "engine" }
> {
  try {
    await apiFetch("/api/health");
    return { ok: true };
  } catch (err) {
    if (err instanceof ApiUnreachableError) {
      return { ok: false, message: err.message, missing: err.missing };
    }
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
      missing: "engine",
    };
  }
}

export async function analyzeFile(file: File): Promise<AnalyzeResponse> {
  const form = new FormData();
  form.append("file", file);
  const res = await apiFetch("/api/analyze", { method: "POST", body: form });
  return res.json();
}

export async function loadDemo(): Promise<AnalyzeResponse> {
  const res = await apiFetch("/api/demo", { method: "POST" });
  return res.json();
}

export async function processAudio(
  sessionId: string,
  config: ProcessConfig,
): Promise<ProcessResponse> {
  const res = await apiFetch("/api/process", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, ...config }),
  });
  return res.json();
}

export async function fetchAudioBuffer(url: string, ctx: AudioContext): Promise<AudioBuffer> {
  const res = await apiFetch(url);
  return ctx.decodeAudioData(await res.arrayBuffer());
}

/** Fetch + parse a microscope groove window (layout: backend detail_window.py:
 * 8-float header, then lateral_mm[n], vertical_mm[n]). */
export async function fetchGrooveWindow(
  sessionId: string,
  t: number,
  spanMm = 80,
  maxPoints = 2000,
): Promise<GrooveWindow> {
  const url =
    `/api/session/${sessionId}/groove-window?t=${t.toFixed(3)}` +
    `&span_mm=${spanMm}&max_points=${maxPoints}`;
  const res = await apiFetch(url);
  const f = new Float32Array(await res.arrayBuffer());
  const n = f[0] | 0;
  if (f.length !== 8 + 2 * n) {
    throw new Error(`groove window payload mismatch: ${f.length} != ${8 + 2 * n}`);
  }
  return {
    n,
    dsMm: f[1],
    s0Mm: f[2],
    t0S: f[3],
    rCenterMm: f[4],
    pitchMm: f[5],
    turnPeriodS: f[6],
    durationS: f[7],
    latMm: f.subarray(8, 8 + n),
    vertMm: f.subarray(8 + n, 8 + 2 * n),
  };
}

/** Parse the raw float32 blob into its five arrays (layout: see GeometryMeta). */
export async function fetchGeometry(url: string, meta: GeometryMeta): Promise<GrooveGeometry> {
  const res = await apiFetch(url);
  const raw = await res.arrayBuffer();
  const n = meta.n_points;
  const f32 = new Float32Array(raw);
  if (f32.length !== n * 5) {
    throw new Error(`geometry payload size mismatch: ${f32.length} != ${n * 5}`);
  }
  return {
    meta,
    theta: f32.subarray(0, n),
    radius: f32.subarray(n, 2 * n),
    lateral: f32.subarray(2 * n, 3 * n),
    vertical: f32.subarray(3 * n, 4 * n),
    timeS: f32.subarray(4 * n, 5 * n),
  };
}
