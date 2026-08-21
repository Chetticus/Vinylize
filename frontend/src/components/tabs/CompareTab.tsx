import { engine, useStore } from "../../state/store";
import Waveform from "../Waveform";

export default function CompareTab() {
  const { analysis, vinylPeaks, originalPeaks, positionS, seek, mode, setMode } = useStore();
  if (!analysis || !vinylPeaks) return null;

  const playheadF = engine.duration ? positionS / engine.duration : undefined;
  const origPeaks = originalPeaks ?? analysis.waveform;

  return (
    <div className="compare-grid">
      <div
        className="panel"
        style={{ borderColor: mode === "original" ? "var(--accent)" : undefined, cursor: "pointer" }}
        onClick={() => setMode("original")}
      >
        <h3>Original {mode === "original" && "· listening"}</h3>
        <p className="sub">The untouched upload (silent through the shared lead-in).</p>
        <Waveform
          mins={origPeaks.mins}
          maxs={origPeaks.maxs}
          color="#8d7f66"
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
            The vinyl side is not an EQ preset: it is the sum of a stylus tracing a spiral
            groove, an imperfect turntable, and the record's own surface. The <b>3D Groove</b>
            tab shows the same groove the simulation just read.
          </li>
        </ul>
      </div>
    </div>
  );
}
