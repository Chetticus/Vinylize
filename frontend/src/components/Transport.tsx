import { useEffect } from "react";
import { useShallow } from "zustand/react/shallow";
import { engine, useStore } from "../state/store";
import "./player.css";

function fmt(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

export default function Transport() {
  const { playing, mode, positionS, volume, togglePlay, setMode, seek, setVolume, tick, processResult, analysis } =
    useStore(useShallow((s) => ({
      playing: s.playing, mode: s.mode, positionS: s.positionS, volume: s.volume,
      togglePlay: s.togglePlay, setMode: s.setMode, seek: s.seek,
      setVolume: s.setVolume, tick: s.tick, processResult: s.processResult, analysis: s.analysis,
    })));
  const duration = engine.duration;
  const ready = processResult !== null;
  const [artist, ...titleParts] = analysis?.filename.split(" — ") ?? [];
  const title = titleParts.length ? titleParts.join(" — ") : analysis?.filename;
  useEffect(() => {
    const id = window.setInterval(tick, 100);
    return () => window.clearInterval(id);
  }, [tick]);

  return (
    <section className="player" aria-label="Record player">
      <div className="player-meta">
        <div className="playing-title">
          <strong>{title ?? "Choose a record"}</strong>
          {titleParts.length > 0 && <span>{artist}</span>}
        </div>
        <div className="playback-modes" role="group" aria-label="Listening version">
          <button className={mode === "original" ? "active" : ""} aria-pressed={mode === "original"}
            onClick={() => setMode("original")} disabled={!ready} title="The clean original recording">Digital</button>
          <span aria-hidden>/</span>
          <button className={mode === "vinyl" ? "active" : ""} aria-pressed={mode === "vinyl"}
            onClick={() => setMode("vinyl")} disabled={!ready} title="Vinyl warmth and room acoustics">Vinyl</button>
        </div>
      </div>
      <div className="player-controls">
        <button className="play-button" onClick={togglePlay} disabled={!ready} aria-label={playing ? "Pause" : "Play"}>
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            {playing ? <path d="M7 5h3v14H7zm7 0h3v14h-3z" fill="currentColor" /> :
              <path d="m8 4 12 8-12 8z" fill="currentColor" />}
          </svg>
        </button>
        <div className="player-timeline">
          <input type="range" min={0} max={duration || 1} step={0.01}
            value={Math.min(positionS, duration || 1)} onChange={(e) => seek(Number(e.target.value))}
            disabled={!ready} aria-label="Playback position" aria-valuetext={`${fmt(positionS)} of ${fmt(duration)}`} />
          <div className="player-times"><span>{fmt(positionS)}</span><span>{fmt(duration)}</span></div>
        </div>
        <label className="player-volume" title={`Volume ${Math.round(volume * 100)}% (100% is source level)`}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <path d="M4 9h4l5-4v14l-5-4H4z" />
            {volume > 0 ? <path d="M17 8c2 2 2 6 0 8m3-11c4 4 4 10 0 14" /> : <path d="m17 9 5 6m0-6-5 6" />}
          </svg>
          <input type="range" min={0} max={4} step={0.05} value={volume}
            onChange={(e) => setVolume(Number(e.target.value))} aria-label="Volume" />
        </label>
      </div>
    </section>
  );
}
