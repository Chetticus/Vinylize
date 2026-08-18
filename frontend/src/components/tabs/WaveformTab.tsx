import { engine, useStore } from "../../state/store";
import Waveform from "../Waveform";

export default function WaveformTab() {
  const { analysis, originalPeaks, positionS, seek } = useStore();
  if (!analysis) return null;

  // Prefer the padded peaks (they include the 6 s lead-in groove, so the
  // playhead lines up with the transport); analysis peaks are the fallback
  // while processing is still in flight.
  const peaks = originalPeaks ?? analysis.waveform;

  return (
    <div>
      <div className="panel">
        <h3>Original waveform</h3>
        <p className="sub">
          The clip exactly as uploaded (after the shared 6-second lead-in) — the reference every
          simulated change is measured against. Click the waveform to seek.
        </p>
        <Waveform
          mins={peaks.mins}
          maxs={peaks.maxs}
          playhead={engine.duration ? positionS / engine.duration : undefined}
          onSeek={(f) => seek(f * engine.duration)}
        />
        <div className="meta-chips">
          <span className="chip">
            Duration <b>{analysis.clip_duration_s.toFixed(2)} s</b>
            {analysis.full_duration_s > analysis.clip_duration_s + 0.05 &&
              ` (of ${analysis.full_duration_s.toFixed(1)} s)`}
          </span>
          <span className="chip">
            Sample rate <b>{analysis.sample_rate.toLocaleString()} Hz</b>
          </span>
          <span className="chip">
            Channels <b>{analysis.is_stereo ? "2 (stereo)" : "1 (mono)"}</b>
          </span>
        </div>
      </div>

      <div className="panel">
        <h3>What happens next</h3>
        <p className="sub" style={{ marginBottom: 0 }}>
          This clip has been cut into a spiral groove on a virtual record. Open the{" "}
          <b>3D Groove</b> tab to look at it, <b>Compare</b> to hear it played back through a
          stylus, and <b>The Vinyl Story</b> for where the format came from.
        </p>
      </div>
    </div>
  );
}
