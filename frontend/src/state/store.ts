/**
 * Single Zustand store: upload session, processed result, DSP config, and
 * playback state. Processing is config-hash-cached so toggling between tabs
 * or re-selecting an identical config never re-hits the network.
 */

import { create } from "zustand";

import {
  analyzeFile,
  fetchAudioBuffer,
  fetchGeometry,
  loadDemo,
  processAudio,
} from "../api/client";
import { PlaybackEngine, type PlaybackMode } from "../audio/playbackEngine";
import {
  DEFAULT_CONFIG,
  type AnalyzeResponse,
  type GrooveGeometry,
  type ProcessConfig,
  type ProcessResponse,
} from "../types/api";

export type TabKey = "waveform" | "groove" | "compare" | "explorer";

export const engine = new PlaybackEngine();

/** Backend keeps this many sessions in its LRU (see backend sessions.py) —
 * the library must not offer more than the server still remembers. */
const LIBRARY_CAP = 4;

interface SessionState {
  analysis: AnalyzeResponse | null;
  /** Previously loaded clips, most recent first — click to switch back. */
  library: AnalyzeResponse[];
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
  loading: string | null; // human-readable phase, or null when idle
  /** Render progress 0..1 while the backend is simulating, else null. */
  progressFrac: number | null;
  error: string | null;

  playing: boolean;
  mode: PlaybackMode;
  positionS: number;
  volume: number;

  upload: (file: File) => Promise<void>;
  useDemo: () => Promise<void>;
  selectSession: (sessionId: string) => Promise<void>;
  setTab: (tab: TabKey) => void;
  /** Jump to the Explorer with a specific stage card selected. */
  openExplorerCard: (key: string) => void;
  clearExplorerFocus: () => void;

  togglePlay: () => void;
  setMode: (mode: PlaybackMode) => void;
  seek: (s: number) => void;
  setVolume: (v: number) => void;
  tick: () => void; // interval-driven position refresh
}

let lastProcessedKey = "";

/** Client-side min/max peaks from a decoded buffer (for the vinyl waveform). */
function computePeaks(buffer: AudioBuffer, buckets = 2000): { mins: number[]; maxs: number[] } {
  const data = buffer.getChannelData(0);
  const mins: number[] = [];
  const maxs: number[] = [];
  const per = Math.max(1, Math.floor(data.length / buckets));
  for (let i = 0; i < data.length; i += per) {
    let lo = Infinity;
    let hi = -Infinity;
    const end = Math.min(i + per, data.length);
    for (let j = i; j < end; j++) {
      if (data[j] < lo) lo = data[j];
      if (data[j] > hi) hi = data[j];
    }
    mins.push(lo);
    maxs.push(hi);
  }
  return { mins, maxs };
}

export const useStore = create<SessionState>((set, get) => {
  engine.onEnded = () => set({ playing: false, positionS: 0 });

  async function runProcess(): Promise<void> {
    const { analysis, config } = get();
    if (!analysis) return;
    const key = analysis.session_id + JSON.stringify(config);
    if (key === lastProcessedKey && get().processResult) return;

    set({ loading: "Simulating vinyl playback…", progressFrac: 0, error: null });

    // Poll the backend's stage-level render progress while /process runs.
    const poll = window.setInterval(() => {
      void fetch(`/api/session/${analysis.session_id}/progress`)
        .then((r) => (r.ok ? r.json() : null))
        .then((p: { frac: number; label: string } | null) => {
          if (p && get().progressFrac !== null) {
            set({ progressFrac: p.frac, loading: p.label || "Simulating…" });
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
      set({ loading: "Decoding audio…", progressFrac: 0.95 });
      // One throwaway AudioContext for decoding; playback creates its own on
      // first user gesture (browser autoplay policy).
      const ctx = new AudioContext();
      const [originalBuf, vinylBuf, geometry] = await Promise.all([
        fetchAudioBuffer(result.original_url, ctx),
        fetchAudioBuffer(result.vinyl_url, ctx),
        fetchGeometry(result.geometry_url, result.geometry),
      ]);
      void ctx.close();

      const wasPlaying = get().playing;
      const pos = engine.position();
      engine.setBuffers(originalBuf, vinylBuf);
      if (wasPlaying) engine.play(pos); // keep listening position across re-process

      lastProcessedKey = key;
      set({
        processResult: result,
        geometry,
        vinylPeaks: computePeaks(vinylBuf),
        originalPeaks: computePeaks(originalBuf),
        loading: null,
        progressFrac: null,
        playing: wasPlaying,
      });
    } catch (err) {
      set({
        loading: null,
        progressFrac: null,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      window.clearInterval(poll);
    }
  }

  /** Make `analysis` the active clip and (re)run the pipeline for it. */
  async function activate(analysis: AnalyzeResponse): Promise<void> {
    engine.stop();
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
      positionS: 0,
      loading: null,
    }));
    await runProcess();
  }

  async function ingest(load: () => Promise<AnalyzeResponse>): Promise<void> {
    set({ loading: "Analyzing audio…", error: null });
    engine.stop();
    try {
      await activate(await load());
    } catch (err) {
      set({ loading: null, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return {
    analysis: null,
    library: [],
    processResult: null,
    geometry: null,
    vinylPeaks: null,
    originalPeaks: null,
    config: { ...DEFAULT_CONFIG },
    activeTab: "waveform",
    explorerFocus: null,
    loading: null,
    progressFrac: null,
    error: null,
    playing: false,
    mode: "vinyl",
    positionS: 0,
    // Unity is a clean A/B reference. Boost remains available up to 4x.
    volume: 1,

    upload: (file) => ingest(() => analyzeFile(file)),
    useDemo: () => ingest(loadDemo),

    selectSession: async (sessionId) => {
      const entry = get().library.find((e) => e.session_id === sessionId);
      if (!entry || entry.session_id === get().analysis?.session_id) return;
      try {
        await activate(entry);
      } catch (err) {
        set({ loading: null, error: err instanceof Error ? err.message : String(err) });
      }
    },

    setTab: (tab) => set({ activeTab: tab }),
    openExplorerCard: (key) => set({ activeTab: "explorer", explorerFocus: key }),
    clearExplorerFocus: () => set({ explorerFocus: null }),

    togglePlay: () => {
      if (!engine.isReady) return;
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

    tick: () => {
      if (get().playing) set({ positionS: engine.position() });
    },
  };
});
