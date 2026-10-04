import { engine, useStore } from "../../state/store";
import Waveform from "../Waveform";

export default function CompareTab() {
  const { analysis, vinylPeaks, originalPeaks, positionS, seek, mode, setMode } = useStore();
  if (!analysis || !vinylPeaks) return null;

  const playheadF = engine.duration ? positionS / engine.duration : undefined;
  const origPeaks = originalPeaks ?? analysis.waveform;

  return (
    <div className="compare-page">
      <header className="compare-intro">
        <span className="compare-kicker">One recording · two paths</span>
        <h2>Listen to what the groove changes.</h2>
        <p>
          Both waveforms share the same clock. Start playback, then move between the clean source
          and the simulated pressing without losing your place.
        </p>
        <div className="meta-chips">
          <span className="chip">{analysis.clip_duration_s.toFixed(1)} seconds</span>
          <span className="chip">{(analysis.sample_rate / 1000).toFixed(1)} kHz</span>
          <span className="chip">{analysis.is_stereo ? "Stereo" : "Mono"}</span>
        </div>
      </header>

      <div className="waveform-pair">
        <button
          className={`waveform-card${mode === "original" ? " active" : ""}`}
          onClick={() => setMode("original")}
          aria-pressed={mode === "original"}
        >
          <span className="waveform-number">01</span>
          <span className="waveform-heading">
            <strong>Digital recording</strong>
            <small>{mode === "original" ? "Listening now" : "Choose this version"}</small>
          </span>
          <span className="waveform-copy">Untouched apart from the shared lead-in.</span>
          <Waveform
            mins={origPeaks.mins}
            maxs={origPeaks.maxs}
            color="#8d7f66"
            playhead={playheadF}
            onSeek={(f) => seek(f * engine.duration)}
          />
        </button>

        <button
          className={`waveform-card vinyl-card${mode === "vinyl" ? " active" : ""}`}
          onClick={() => setMode("vinyl")}
          aria-pressed={mode === "vinyl"}
        >
          <span className="waveform-number">02</span>
          <span className="waveform-heading">
            <strong>Vinyl pressing</strong>
            <small>{mode === "vinyl" ? "Listening now" : "Choose this version"}</small>
          </span>
          <span className="waveform-copy">The same song after the stylus, surface and turntable.</span>
          <Waveform
            mins={vinylPeaks.mins}
            maxs={vinylPeaks.maxs}
            playhead={playheadF}
            onSeek={(f) => seek(f * engine.duration)}
          />
        </button>
      </div>

      <section className="listening-note">
        <span className="note-mark" aria-hidden>耳</span>
        <div>
          <h3>A few things to listen for</h3>
          <p>
            Sustained notes reveal wow and flutter. Bright percussion exposes tracing loss. Quiet
            passages make the surface noise easy to hear, while loud peaks bring out the groove’s
            saturation. The differences are deliberately stronger than a pristine pressing so they
            remain audible on ordinary speakers.
          </p>
        </div>
      </section>
    </div>
  );
}
