import { useEffect, useMemo, useState } from "react";

import { useStore } from "../../state/store";
import { makeSectionParams, sectionAtTime, type ChannelView } from "../groove/grooveMath";
import { clipTime, stylusStatus, type StylusStatus } from "../groove/recordMotion";
import { ARM, validateKinematics } from "../groove/tonearmKinematics";
import TurntableScene, { type EnvironmentKind } from "../groove/TurntableScene";

const VIEWS: Array<[ChannelView, string, string]> = [
  ["both", "Both", "Full groove: lateral wiggle + depth modulation"],
  ["lateral", "Lateral (L+R)", "Only the mono-sum component — what a mono record is"],
  ["vertical", "Vertical (L−R)", "Only the stereo-difference component — depth breathing"],
];

interface Readout {
  timeS: number;
  radiusMm: number;
  status: StylusStatus;
}

export default function GrooveTab() {
  const { geometry, analysis, playing, seek } = useStore();
  const [modExag, setModExag] = useState(150);
  const [view, setView] = useState<ChannelView>("both");
  const [environment, setEnvironment] = useState<EnvironmentKind>("cafe");
  const [debug, setDebug] = useState(false);
  const [resetSignal, setResetSignal] = useState(0);
  const [readout, setReadout] = useState<Readout>({ timeS: 0, radiusMm: 0, status: "resting" });

  const params = useMemo(
    () => (geometry ? makeSectionParams(geometry, modExag, view) : null),
    [geometry, modExag, view],
  );

  // Debug: pure-math kinematics self-check (no scene graph, so it runs even
  // when WebGL frames are suspended). Confirms the solved stylus tip lands
  // on the contact groove's radius within tolerance across the whole clip.
  useEffect(() => {
    if (!debug || !geometry || !params) return;
    const worst = validateKinematics(ARM, geometry, params);
    // eslint-disable-next-line no-console
    console.log(
      `[tonearm debug] kinematics self-check: worst tip/groove radius error ` +
        `${worst.toFixed(3)} mm over the clip (tolerance 1 mm) — ` +
        (worst < 1 ? "OK" : "FAIL"),
    );
  }, [debug, geometry, params]);

  // Readout refresh: 4 Hz is plenty for text, and (unlike useFrame) keeps
  // ticking even when the tab renders in a hidden/backgrounded pane.
  useEffect(() => {
    if (!geometry) return;
    const id = window.setInterval(() => {
      const t = clipTime();
      const i = sectionAtTime(geometry, t);
      setReadout({
        timeS: t,
        radiusMm: geometry.radius[i] * 1000,
        status: stylusStatus(t, useStore.getState().playing),
      });
    }, 250);
    return () => window.clearInterval(id);
  }, [geometry]);

  if (!geometry || !params) return null;
  const m = geometry.meta;

  return (
    <div className="tab-content-inner" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div className="groove-toolbar">
        {VIEWS.map(([key, label, hint]) => (
          <button
            key={key}
            className={`btn small${view === key ? " active" : ""}`}
            title={hint}
            onClick={() => setView(key)}
          >
            {label}
          </button>
        ))}
        <span className="env-toggle" role="group" aria-label="Environment">
          <button
            className={`btn small${environment === "cafe" ? " active" : ""}`}
            title="Night café listening room"
            onClick={() => setEnvironment("cafe")}
          >
            ☕ Café
          </button>
          <button
            className={`btn small${environment === "studio" ? " active" : ""}`}
            title="Minimal dark studio"
            onClick={() => setEnvironment("studio")}
          >
            Studio
          </button>
        </span>
        <button
          className="btn small"
          title="Re-frame the camera on the whole turntable"
          onClick={() => setResetSignal((n) => n + 1)}
        >
          ⌂ Reset camera
        </button>
        <label className="debug-toggle" title="Show pivot, arm reach circle, and stylus/target markers">
          <input type="checkbox" checked={debug} onChange={(e) => setDebug(e.target.checked)} />
          debug
        </label>
        <div className="spacer" />
        <label>
          Modulation zoom ×{params.modExag.toFixed(0)}
          {params.modExag < modExag - 1 && " (capped so grooves can't collide)"}
          <input
            type="range"
            min={30}
            max={500}
            step={10}
            value={modExag}
            onChange={(e) => setModExag(Number(e.target.value))}
          />
        </label>
      </div>

      <div className="groove-wrap">
        <TurntableScene
          geometry={geometry}
          params={params}
          filename={analysis?.filename ?? "Vinylize"}
          environment={environment}
          debug={debug}
          resetSignal={resetSignal}
          onScrub={seek}
        />
        <div className="groove-hud">
          <div className="readout-row">
            <span className="readout-chip">33⅓ RPM</span>
            <span className="readout-chip">
              t&nbsp;<b>{readout.timeS.toFixed(1)} s</b>
            </span>
            <span className="readout-chip">
              groove radius&nbsp;<b>{readout.radiusMm.toFixed(1)} mm</b>
            </span>
            <span className={`readout-chip status-${readout.status}`}>
              stylus: <b>{readout.status}</b>
            </span>
          </div>
          <b>{m.revolutions.toFixed(1)} revolutions</b> · {m.groove_length_m.toFixed(1)} m of
          groove · peak excursion <b>{m.peak_excursion_um.toFixed(1)} µm</b>
          <br />
          Press play: the record turns at a true 33⅓ RPM and the tonearm tracks the groove
          inward. Drag to orbit · scroll to zoom · <b>click the groove to play from that spot</b>.
          <br />
          Honest scaling: audio wiggle ×{params.modExag.toFixed(0)}, groove spacing ×
          {params.radialExag.toFixed(1)} — real grooves modulate by micrometers.
          {playing ? "" : " (deck frozen while paused)"}
        </div>
      </div>
    </div>
  );
}
