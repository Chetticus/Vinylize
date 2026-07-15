import { engine, useStore } from "../../state/store";
import Waveform from "../Waveform";

export default function WaveformTab() {
  const { analysis, positionS, seek } = useStore();
  if (!analysis) return null;

  return (
    <div>
      <div className="panel">
        <h3>Original waveform</h3>
        <p className="sub">
          The clip exactly as uploaded — this is the reference every simulated change is measured
          against. Click the waveform to seek.
        </p>
        <Waveform
          mins={analysis.waveform.mins}
          maxs={analysis.waveform.maxs}
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
          This signal has been RIAA pre-emphasized, encoded into lateral + vertical groove motion,
          and engraved along an Archimedean spiral. Open the <b>3D Groove</b> tab to inspect the
          result, <b>Compare</b> to hear it played back, and the <b>Explorer</b> to see what each
          physical stage did to this exact clip.
        </p>
      </div>
    </div>
  );
}
