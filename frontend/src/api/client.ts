/**
 * Typed fetch wrapper for the backend API. All paths are relative: Vite's dev
 * proxy (see vite.config.ts) forwards /api to FastAPI, and a production build
 * is expected to be served behind the same origin.
 */

import type {
  AnalyzeResponse,
  GeometryMeta,
  GrooveGeometry,
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
  const res = await expectOk(await fetch(url));
  return ctx.decodeAudioData(await res.arrayBuffer());
}

/** Parse the raw float32 blob into its five arrays (layout: see GeometryMeta). */
export async function fetchGeometry(url: string, meta: GeometryMeta): Promise<GrooveGeometry> {
  const res = await expectOk(await fetch(url));
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
