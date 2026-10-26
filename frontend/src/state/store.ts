/**
 * Single Zustand store: upload session, processed result, DSP config, and
 * playback state. Processing is config-hash-cached so toggling between tabs
 * or re-selecting an identical config never re-hits the network.
 */

import { create } from "zustand";

import {
  ApiUnreachableError,
  analyzeFile,
  checkApiHealth,
  fetchAudioBuffer,
  fetchGeometry,
  listExamples,
  loadDemo,
  loadExample,
  processAudio,
} from "../api/client";
import {
  PlaybackEngine,
  type AcousticSpace,
  type PlaybackMode,
} from "../audio/playbackEngine";
import {
  DEFAULT_CONFIG,
  type AnalyzeResponse,
  type ExampleRecord,
  type GrooveGeometry,
  type ProcessConfig,
  type ProcessResponse,
} from "../types/api";

export type TabKey = "groove" | "explorer";

export const engine = new PlaybackEngine();

/** Backend keeps this many sessions in its LRU (see backend sessions.py) —
 * the library must not offer more than the server still remembers. */
const LIBRARY_CAP = 4;

interface SessionState {
  analysis: AnalyzeResponse | null;
  /** Previously loaded clips, most recent first — click to switch back. */
  library: AnalyzeResponse[];
  /** Example records the engine offers (empty when it has none). */
  examples: ExampleRecord[];
  processResult: ProcessResponse | null;
  geometry: GrooveGeometry | null;
  vinylPeaks: { mins: number[]; maxs: number[] } | null;
  /** Peaks of the padded original (incl. the 6 s lead-in) so waveform
   * playheads align with the transport clock. */
  originalPeaks: { mins: number[]; maxs: number[] } | null;

  config: ProcessConfig;
  activeTab: TabKey;
  /** Card key the Explorer should open + scroll to (set by sidebar links). */
  explorerFocus: string | null;
  /** Set when the API cannot be reached at all, so the UI can explain how
   * to start the missing half instead of showing a raw fetch error. */
  offline: { message: string; missing: "web" | "engine" } | null;
  loading: string | null; // human-readable phase, or null when idle
  /** Render progress 0..1 while the backend is simulating, else null. */
  progressFrac: number | null;
  error: string | null;

  playing: boolean;
  mode: PlaybackMode;
  positionS: number;
  volume: number;
  acousticSpace: AcousticSpace;
  cueing: boolean;

  upload: (file: File) => Promise<void>;
  useExample: (id: string) => Promise<void>;
  useDemo: () => Promise<void>;
  selectSession: (sessionId: string) => Promise<void>;
  setTab: (tab: TabKey) => void;
  /** Liveness probe; run at startup and from the offline notice's retry. */
  checkEngine: () => Promise<void>;
  /** Jump to the Explorer with a specific stage card selected. */
  openExplorerCard: (key: string) => void;
  clearExplorerFocus: () => void;

  togglePlay: () => void;
  setMode: (mode: PlaybackMode) => void;
  seek: (s: number) => void;
  setVolume: (v: number) => void;
  setAcousticSpace: (space: AcousticSpace) => void;
  beginCue: () => void;
  cueTo: (s: number) => void;
  endCue: () => void;
  tick: () => void; // interval-driven position refresh
}

let lastProcessedKey = "";
let resumeAfterCue = false;

interface PreparedRecord {
  original: AudioBuffer;
  vinyl: AudioBuffer;
  geometry: GrooveGeometry;
  result: ProcessResponse;
  bytes: number;
}

// Bound decoded memory, rather than retaining every minutes-long song.
const decodedCache = new Map<string, PreparedRecord>();
const DECODED_BUDGET = 256 * 1024 * 1024;
function cacheRecord(key: string, record: PreparedRecord) {
  decodedCache.delete(key);
  decodedCache.set(key, record);
  let total = [...decodedCache.values()].reduce((sum, r) => sum + r.bytes, 0);
  while (decodedCache.size > 2 || total > DECODED_BUDGET) {
    const first = decodedCache.keys().next().value as string | undefined;
    if (first === undefined) break;
    total -= decodedCache.get(first)!.bytes;
    decodedCache.delete(first);
  }
}

export const useStore = create<SessionState>((set, get) => {
  engine.onEnded = () => set({ playing: false, positionS: 0 });

  async function runProcess(): Promise<void> {
    const { analysis, config } = get();
    if (!analysis) return;
    const key = analysis.session_id + JSON.stringify(config);
    if (key === lastProcessedKey && get().processResult) return;
    const cached = decodedCache.get(key);
    if (cached) {
      decodedCache.delete(key); decodedCache.set(key, cached);
      engine.setBuffers(cached.original, cached.vinyl);
      lastProcessedKey = key;
      set({ processResult: cached.result, geometry: cached.geometry,
        loading: null, progressFrac: null, error: null, playing: false, positionS: 0 });
      return;
    }

    set({ loading: "Simulating vinyl playback…", progressFrac: 0, error: null });

    // Poll the backend's stage-level render progress while /process runs.
    let processing = true;
    const poll = window.setInterval(() => {
      void fetch(`/api/session/${analysis.session_id}/progress`)
        .then((r) => (r.ok ? r.json() : null))
        .then((p: { frac: number; label: string } | null) => {
          if (p && processing) {
            set({ progressFrac: p.frac * 0.8, loading: p.label || "Simulating…" });
          }
        })
        .catch(() => undefined);
    }, 350);

    try {
      let result: ProcessResponse;
      try {
        result = await processAudio(analysis.session_id, config);
      } catch (err) {
        // A 404 means the server evicted (or forgot, after a restart) this
        // session — drop it from the library instead of offering a dead entry.
        if (err instanceof Error && /unknown or expired/i.test(err.message)) {
          set((s) => ({
            library: s.library.filter((e) => e.session_id !== analysis.session_id),
          }));
        }
        throw err;
      }
      window.clearInterval(poll);
      processing = false;
      set({ loading: "Downloading your record…", progressFrac: 0.8 });
      // One throwaway AudioContext for decoding; playback creates its own on
      // first user gesture (browser autoplay policy).
      const ctx = new AudioContext({ sampleRate: analysis.sample_rate });
      const downloads = [{ received: 0, total: 0 }, { received: 0, total: 0 }];
      const reportDownload = (index: number) => (received: number, total: number) => {
        downloads[index] = { received, total };
        const bytes = downloads.reduce((sum, d) => sum + d.received, 0);
        const expected = downloads.reduce((sum, d) => sum + d.total, 0);
        const known = downloads.every((d) => d.total > 0);
        set({
          loading: known && bytes === expected ? "Preparing playback…" :
            `Downloading your record… ${(bytes / 1e6).toFixed(1)}${known ? ` / ${(expected / 1e6).toFixed(1)}` : ""} MB`,
          progressFrac: 0.8 + (known ? Math.min(1, bytes / expected) * 0.19 : 0),
        });
      };
      const [originalBuf, vinylBuf, geometry] = await (async () => {
        try {
          return await Promise.all([
            fetchAudioBuffer(result.original_playback_url ?? result.original_url, ctx,
              reportDownload(0), result.original_lead_in_s ?? 0, analysis.clip_duration_s),
            fetchAudioBuffer(result.vinyl_playback_url ?? result.vinyl_url, ctx, reportDownload(1)),
            fetchGeometry(result.geometry_url, result.geometry),
          ]);
        } finally {
          await ctx.close();
        }
      })();

      const wasPlaying = get().playing;
      const pos = engine.position();
      engine.setBuffers(originalBuf, vinylBuf);
      if (wasPlaying) engine.play(pos); // keep listening position across re-process

      cacheRecord(key, {
        original: originalBuf, vinyl: vinylBuf, geometry, result,
        bytes: (originalBuf.length * originalBuf.numberOfChannels +
          vinylBuf.length * vinylBuf.numberOfChannels) * 4 + geometry.theta.byteLength * 5,
      });
      lastProcessedKey = key;
      set({
        processResult: result,
        geometry,
        // The comparison page was removed; no full-buffer peak scans needed.
        vinylPeaks: null,
        originalPeaks: null,
        loading: null,
        progressFrac: null,
        playing: wasPlaying,
      });
    } catch (err) {
      const unreachable = err instanceof ApiUnreachableError;
      set({
        loading: null,
        progressFrac: null,
        error: unreachable ? null : err instanceof Error ? err.message : String(err),
        offline: unreachable ? { message: err.message, missing: err.missing } : null,
      });
    } finally {
      processing = false;
      window.clearInterval(poll);
    }
  }

  /** Make `analysis` the active clip and (re)run the pipeline for it. */
  async function activate(analysis: AnalyzeResponse): Promise<void> {
    engine.stop();
    resumeAfterCue = false;
    lastProcessedKey = "";
    set((s) => ({
      analysis,
      // Move to the front of the library; drop entries the backend LRU
      // (same capacity) will have evicted anyway.
      library: [analysis, ...s.library.filter((e) => e.session_id !== analysis.session_id)]
        .slice(0, LIBRARY_CAP),
      processResult: null,
      geometry: null,
      vinylPeaks: null,
      originalPeaks: null,
      playing: false,
      cueing: false,
      positionS: 0,
      loading: null,
    }));
    await runProcess();
  }

  async function ingest(load: () => Promise<AnalyzeResponse>): Promise<void> {
    if (get().loading !== null) return;
    resumeAfterCue = false;
    set({ loading: "Analyzing audio…", error: null, playing: false, cueing: false });
    engine.stop();
    try {
      await activate(await load());
    } catch (err) {
      const unreachable = err instanceof ApiUnreachableError;
      set({
        loading: null,
        error: unreachable ? null : err instanceof Error ? err.message : String(err),
        offline: unreachable ? { message: err.message, missing: err.missing } : null,
      });
    }
  }

  return {
    analysis: null,
    library: [],
    examples: [],
    processResult: null,
    geometry: null,
    vinylPeaks: null,
    originalPeaks: null,
    config: { ...DEFAULT_CONFIG },
    activeTab: "groove",
    explorerFocus: null,
    offline: null,
    loading: null,
    progressFrac: null,
    error: null,
    playing: false,
    mode: "vinyl",
    positionS: 0,
    // Unity is a clean A/B reference. Boost remains available up to 4x.
    volume: 1,
    // Preserve the listening-room treatment as the sole acoustic space.
    acousticSpace: "room",
    cueing: false,

    upload: (file) => ingest(() => analyzeFile(file)),
    useDemo: () => ingest(loadDemo),
    useExample: async (id) => {
      if (get().loading !== null) return;
      const ex = get().examples.find((e) => e.id === id);
      const name = ex?.artist ? `${ex.artist} — ${ex.title}` : ex?.title;
      const previous = get().library.find((a) => a.filename === name);
      if (previous) await activate(previous);
      else await ingest(() => loadExample(id));
    },

    selectSession: async (sessionId) => {
      if (get().loading !== null) return;
      const entry = get().library.find((e) => e.session_id === sessionId);
      if (!entry || entry.session_id === get().analysis?.session_id) return;
      try {
        await activate(entry);
      } catch (err) {
        set({ loading: null, error: err instanceof Error ? err.message : String(err) });
      }
    },

    setTab: (tab) => set({ activeTab: tab }),

    checkEngine: async () => {
      const health = await checkApiHealth();
      set({
        offline: health.ok ? null : { message: health.message, missing: health.missing },
      });
      if (health.ok && get().examples.length === 0) {
        try {
          set({ examples: await listExamples() });
        } catch {
          /* examples are optional; the upload slot still works */
        }
      }
    },
    openExplorerCard: (key) => set({ activeTab: "explorer", explorerFocus: key }),
    clearExplorerFocus: () => set({ explorerFocus: null }),

    togglePlay: () => {
      if (!engine.isReady || get().cueing) return;
      if (get().playing) {
        engine.pause();
        set({ playing: false, positionS: engine.position() });
      } else {
        engine.setMode(get().mode);
        engine.play();
        set({ playing: true });
      }
    },

    setMode: (mode) => {
      engine.setMode(mode);
      set({ mode });
    },

    seek: (s) => {
      engine.seek(s);
      set({ positionS: s });
    },

    setVolume: (v) => {
      engine.setVolume(v);
      set({ volume: v });
    },

    setAcousticSpace: (space) => {
      engine.setAcousticSpace(space);
      set({ acousticSpace: space });
    },

    beginCue: () => {
      if (!engine.isReady || get().cueing) return;
      resumeAfterCue = get().playing;
      if (resumeAfterCue) engine.pause();
      set({ cueing: true, playing: false, positionS: engine.position() });
    },

    cueTo: (s) => {
      if (!engine.isReady) return;
      engine.seek(s);
      set({ positionS: engine.position() });
    },

    endCue: () => {
      if (!get().cueing) return;
      const shouldResume = resumeAfterCue;
      resumeAfterCue = false;
      if (shouldResume) engine.play();
      set({ cueing: false, playing: shouldResume, positionS: engine.position() });
    },

    tick: () => {
      if (get().playing) set({ positionS: engine.position() });
    },
  };
});
