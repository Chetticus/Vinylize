/**
 * Global playback bar: play/pause, sample-synced Original <-> Vinyl switch,
 * and a seek slider. Position updates on requestAnimationFrame.
 */

import { useEffect } from "react";

import { engine, useStore } from "../state/store";

function fmt(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toFixed(1).padStart(4, "0")}`;
}

export default function Transport() {
  const {
    playing, mode, positionS, volume,
    togglePlay, setMode, seek, setVolume, tick, processResult,
  } = useStore();
  const duration = engine.duration;

  // setInterval rather than requestAnimationFrame: rAF freezes in hidden or
  // backgrounded tabs, but audio keeps playing — the readout must too.
  useEffect(() => {
    const id = window.setInterval(tick, 100);
    return () => window.clearInterval(id);
  }, [tick]);

  const ready = processResult !== null;

  return (
    <div className="transport">
      <button className="btn primary" onClick={togglePlay} disabled={!ready} style={{ minWidth: 84 }}>
        {playing ? "❚❚ Pause" : "▶ Play"}
      </button>
      <div className="ab-switch" title="Switch instantly — playback stays sample-synced">
        <button className={mode === "original" ? "active" : ""} onClick={() => setMode("original")} disabled={!ready}>
          Original
        </button>
        <button className={mode === "vinyl" ? "active" : ""} onClick={() => setMode("vinyl")} disabled={!ready}>
          Vinyl
        </button>
      </div>
      <input
        type="range"
        min={0}
        max={duration || 1}
        step={0.01}
        value={Math.min(positionS, duration || 1)}
        onChange={(e) => seek(Number(e.target.value))}
        disabled={!ready}
      />
      <div className="time">
        {fmt(positionS)} / {fmt(duration)}
      </div>
      <div className="volume" title={`Volume ×${volume.toFixed(2)} — boosted output runs through a limiter, so crank it`}>
        <span aria-hidden>{volume === 0 ? "🔇" : volume < 1.3 ? "🔉" : "🔊"}</span>
        <input
          type="range"
          min={0}
          max={4}
          step={0.05}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          aria-label="Volume"
        />
      </div>
    </div>
  );
}
