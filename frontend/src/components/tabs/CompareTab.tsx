import { engine, useStore } from "../../state/store";
import Waveform from "../Waveform";

export default function CompareTab() {
  const { analysis, vinylPeaks, positionS, seek, mode, setMode } = useStore();
  if (!analysis || !vinylPeaks) return null;

  const playheadF = engine.duration ? positionS / engine.duration : undefined;

  return (
    <div className="compare-grid">
      <div
        className="panel"
        style={{ borderColor: mode === "original" ? "var(--accent)" : undefined, cursor: "pointer" }}
        onClick={() => setMode("original")}
      >
        <h3>Original {mode === "original" && "· listening"}</h3>
        <p className="sub">The untouched upload.</p>
        <Waveform
          mins={analysis.waveform.mins}
          maxs={analysis.waveform.maxs}
          color="#9b988f"
          playhead={playheadF}
          onSeek={(f) => seek(f * engine.duration)}
        />
      </div>

      <div
        className="panel"
        style={{ borderColor: mode === "vinyl" ? "var(--accent)" : undefined, cursor: "pointer" }}
        onClick={() => setMode("vinyl")}
      >
        <h3>Vinyl simulation {mode === "vinyl" && "· listening"}</h3>
        <p className="sub">
          The same clip after cutting, the groove medium, and an imperfect turntable.
        </p>
        <Waveform
          mins={vinylPeaks.mins}
          maxs={vinylPeaks.maxs}
          playhead={playheadF}
          onSeek={(f) => seek(f * engine.duration)}
        />
      </div>

      <div className="panel">
        <h3>How to listen</h3>
        <ul className="listen-hints">
          <li>
            Press <b>Play</b>, then flip <b>Original / Vinyl</b> on the transport bar (or click a
            panel above) — the switch is sample-synced, so the only thing that changes is the
            physics.
          </li>
          <li>
            <b>Sustained notes</b> reveal wow &amp; flutter; <b>bright percussion</b> reveals
            tracing loss; <b>quiet passages</b> reveal the noise floor; <b>loud peaks</b> reveal
            saturation "warmth".
          </li>
          <li>
            Then open <b>DSP Controls</b> and switch stages off one at a time to isolate each
            effect — or drag the groove position inward and hear the same file degrade near the
            label.
          </li>
        </ul>
      </div>
    </div>
  );
}
