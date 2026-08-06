/**
 * Typed fetch wrapper for the backend API. All paths are relative: Vite's dev
 * proxy (see vite.config.ts) forwards /api to FastAPI, and a production build
 * is expected to be served behind the same origin.
 */

import type {
  AnalyzeResponse,
  GeometryMeta,
  GrooveGeometry,
  GrooveWindow,
  ProcessConfig,
  ProcessResponse,
} from "../types/api";

async function expectOk(res: Response): Promise<Response> {
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { detail?: string };
      if (body.detail) detail = body.detail;
    } catch {
      /* non-JSON error body; keep the status text */
    }
    throw new Error(detail);
  }
  return res;
}

export async function analyzeFile(file: File): Promise<AnalyzeResponse> {
  const form = new FormData();
  form.append("file", file);
  const res = await expectOk(await fetch("/api/analyze", { method: "POST", body: form }));
  return res.json();
}

export async function loadDemo(): Promise<AnalyzeResponse> {
  const res = await expectOk(await fetch("/api/demo", { method: "POST" }));
  return res.json();
}

export async function processAudio(
  sessionId: string,
  config: ProcessConfig,
): Promise<ProcessResponse> {
  const res = await expectOk(
    await fetch("/api/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, ...config }),
    }),
  );
  return res.json();
}

export async function fetchAudioBuffer(url: string, ctx: AudioContext): Promise<AudioBuffer> {
  // Re-processing a session reuses this URL. Never let browser caching make
  // the A/B control silently play a previous render.
  const res = await expectOk(await fetch(url, { cache: "no-store" }));
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
  const res = await expectOk(await fetch(url, { cache: "no-store" }));
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
  const res = await expectOk(await fetch(url, { cache: "no-store" }));
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
