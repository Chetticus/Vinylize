/**
 * Mirrors backend/app/api/schemas.py — if a field changes there, change it here.
 */

export interface WaveformData {
  mins: number[];
  maxs: number[];
}

export interface AnalyzeResponse {
  session_id: string;
  sample_rate: number;
  n_channels: number;
  is_stereo: boolean;
  full_duration_s: number;
  clip_duration_s: number;
  waveform: WaveformData;
  filename: string;
}

/** An example record offered in the sidebar (GET /api/examples). */
export interface ExampleRecord {
  id: string;
  title: string;
  artist: string | null;
  duration_s: number;
}

/** Stage toggles + parameter scales (1.0 = physically realistic). */
export interface ProcessConfig {
  riaa: boolean;
  stylus: boolean;
  compliance: boolean;
  wow_flutter: boolean;
  clicks: boolean;
  crosstalk: boolean;
  noise: boolean;
  start_radius_mm: number;
  stylus_size: number;
  saturation_drive: number;
  wow_depth: number;
  click_density: number;
  crosstalk_amount: number;
  noise_level: number;
  seed: number;
}

/**
 * Defaults model a mid-disc cut on a well-worn record so the vinyl character
 * is unmistakable on first listen; 1x on every scale remains "pristine
 * pressing, measured reality". Mirrors backend schemas.py.
 */
export const DEFAULT_CONFIG: ProcessConfig = {
  riaa: true,
  stylus: true,
  compliance: true,
  wow_flutter: true,
  clicks: true,
  crosstalk: true,
  noise: true,
  start_radius_mm: 146, // outer edge: the stylus drops onto the rim lead-in
  // Educational "worn favorite" preset: stronger than a clean pressing so
  // the physical effects remain obvious on laptop speakers. Use 1x controls
  // for the subtler measured-realism version of the same model.
  stylus_size: 2.75,
  saturation_drive: 4,
  wow_depth: 3,
  click_density: 4,
  crosstalk_amount: 2,
  noise_level: 4,
  seed: 1109,
};

export interface ExplorerCard {
  key: string;
  title: string;
  subtitle: string;
  physics: string;
  where_on_record: string;
  why_unavoidable: string;
  your_track: string[];
  enabled: boolean;
}

export interface GeometryMeta {
  n_points: number;
  peak_excursion_um: number;
  groove_length_m: number;
  revolutions: number;
  start_radius_mm: number;
  groove_pitch_um: number;
  groove_half_width_um: number;
}

export interface ProcessResponse {
  session_id: string;
  geometry: GeometryMeta;
  cards: ExplorerCard[];
  vinyl_url: string;
  original_url: string;
  geometry_url: string;
}

/**
 * Parsed groove-window payload from /api/session/{id}/groove-window —
 * a short high-resolution slice of the engraved groove around a playback
 * time, used by the 3D microscope (see backend detail_window.py).
 * All lengths in millimeters.
 */
export interface GrooveWindow {
  n: number;
  dsMm: number;
  s0Mm: number;
  /** Nominal playback time of the window's first sample (s). */
  t0S: number;
  rCenterMm: number;
  pitchMm: number;
  /** One revolution at 33 1/3 RPM (~1.8 s) — adjacent-turn time offset. */
  turnPeriodS: number;
  durationS: number;
  latMm: Float32Array;
  vertMm: Float32Array;
}

/** Parsed form of the binary geometry payload (5 x n_points float32). */
export interface GrooveGeometry {
  meta: GeometryMeta;
  theta: Float32Array;
  radius: Float32Array;
  lateral: Float32Array;
  vertical: Float32Array;
  timeS: Float32Array;
}
