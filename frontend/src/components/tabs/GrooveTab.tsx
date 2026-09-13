import { useEffect, useMemo, useRef, useState } from "react";

import { useStore } from "../../state/store";
import { sectionAtTime, type ChannelView } from "../groove/grooveMath";
import { safeAudioBoost, scaleLabel } from "../groove/grooveScale";
import { type LodMode } from "../groove/grooveLod";
import { clipTime, isFrozen, setFrozen, stylusStatus, type StylusStatus } from "../groove/recordMotion";
import { ARM, validateKinematics } from "../groove/tonearmKinematics";
import TurntableScene, { type EnvironmentKind, type FlyRequest } from "../groove/TurntableScene";

const STEREO_VIEWS: Array<[ChannelView, string, string]> = [
  ["both", "Full stereo", "Complete groove: lateral swing + wall/depth modulation"],
  ["lateral", "L+R", "Mono sum only — pure lateral motion, constant depth (a mono record)"],
  ["vertical", "L−R", "Stereo difference only — the walls/depth breathe, no lateral swing"],
];

const LOD_MODES: Array<[LodMode, string, string]> = [
  ["overview", "Overview", "Whole turntable — the groove band reads as satin"],
  ["closeup", "Close-up", "Individual turns at their true ~0.25 mm spacing"],
  ["microscope", "Microscope", "Millimeters from the vinyl: the V-trench itself"],
];

interface Readout {
  timeS: number;
  radiusMm: number;
  status: StylusStatus;
}

export default function GrooveTab() {
  const { geometry, analysis, processResult, config, seek } = useStore();

  const [view, setView] = useState<ChannelView>("both");
  const [environment, setEnvironment] = useState<EnvironmentKind>("cafe");
  const [audioBoostReq, setAudioBoostReq] = useState(250);
  const [cutaway, setCutaway] = useState(false);
  const [guides, setGuides] = useState(false);
  const [follow, setFollow] = useState(false);
  const [freeze, setFreeze] = useState(false);
  const [debug, setDebug] = useState(false);
  const [fly, setFly] = useState<FlyRequest>({ mode: "overview", seq: 0 });
  const [resetSignal, setResetSignal] = useState(0);
  const [microActive, setMicroActive] = useState(false);
  const [showHud, setShowHud] = useState(() => !window.matchMedia?.("(max-width: 900px)").matches);
  const [readout, setReadout] = useState<Readout>({ timeS: 0, radiusMm: 0, status: "resting" });
  // The card starts folded when the canvas is narrow, so the room isn't
  // covered; once the listener opens or folds it, their choice stands.
  const [panelOpen, setPanelOpen] = useState(() => !window.matchMedia?.("(max-width: 760px)").matches);
  const panelToggled = useRef(false);
  const panelRef = useRef<HTMLElement>(null);
  const [panelInset, setPanelInset] = useState(0);

  // Tell the camera how much of the canvas the card covers, so the subject
  // is framed in the part left visible (see CameraRig's film offset).
  useEffect(() => {
    const el = panelRef.current;
    const wrapEl = el?.parentElement;
    if (!el || !wrapEl) return;
    const measure = () => {
      const wrap = wrapEl.getBoundingClientRect();
      if (panelOpen && !panelToggled.current && wrap.width > 0 && wrap.width < 620) {
        setPanelOpen(false);
        return;
      }
      const r = el.getBoundingClientRect();
      setPanelInset(!panelOpen || wrap.width < 700 ? 0 : Math.round(wrap.right - r.left));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    ro.observe(wrapEl);
    return () => ro.disconnect();
  }, [panelOpen, geometry]);

  const effectiveBoost = useMemo(
    () => (geometry ? safeAudioBoost(geometry, audioBoostReq) : audioBoostReq),
    [geometry, audioBoostReq],
  );

  // Freeze-record wiring (module-level flag read by the deck clock).
  useEffect(() => {
    setFrozen(freeze);
    return () => setFrozen(false);
  }, [freeze]);

  // Debug: pure-math kinematics self-check (runs even with WebGL frames
  // suspended). Confirms the solved tip lands on the contact groove radius.
  useEffect(() => {
    if (!debug || !geometry) return;
    const worst = validateKinematics(ARM, geometry);
    // eslint-disable-next-line no-console
    console.log(
      `[tonearm debug] kinematics self-check: worst tip/groove radius error ` +
        `${worst.toFixed(3)} mm over the clip (tolerance 1 mm) — ` +
        (worst < 1 ? "OK" : "FAIL"),
    );
  }, [debug, geometry]);

  // Readout refresh at 4 Hz (interval, not rAF: keeps ticking in hidden panes).
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

  if (!geometry || !analysis || !processResult) return null;

  const flyTo = (mode: LodMode) => setFly((f) => ({ mode, seq: f.seq + 1 }));

  return (
    <div className="tab-content-inner" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div className="groove-toolbar">
        <span className="env-toggle" role="group" aria-label="Environment">
          <button
            className={`btn small${environment === "cafe" ? " active" : ""}`}
            onClick={() => setEnvironment("cafe")}
          >
            Listening room
          </button>
          <button
            className={`btn small${environment === "studio" ? " active" : ""}`}
            onClick={() => setEnvironment("studio")}
          >
            Studio
          </button>
        </span>
        <label className="debug-toggle" title="Pivot, arm-reach circle, stylus/target markers + console self-check">
          <input type="checkbox" checked={debug} onChange={(e) => setDebug(e.target.checked)} />
          debug
        </label>
        <div className="spacer" />
        <span style={{ fontSize: 12, color: "var(--text-dim)" }}>
          Zoom in — the microscope wakes up under 5 cm from the stylus.
        </span>
      </div>

      <div className="groove-wrap">
        <TurntableScene
          geometry={geometry}
          filename={analysis.filename}
          sessionId={analysis.session_id}
          dataVersion={processResult}
          environment={environment}
          view={view}
          audioBoost={effectiveBoost}
          cutaway={cutaway}
          guides={guides}
          follow={follow}
          stylusSizeScale={config.stylus_size}
          debug={debug}
          fly={fly}
          resetSignal={resetSignal}
          onScrub={seek}
          onMicroActive={setMicroActive}
          insetRight={panelInset}
        />

        {/* ------------- inspection card (top-right, collapsible) ------------- */}
        <aside
          ref={panelRef}
          className={`groove-panel${panelOpen ? "" : " collapsed"}`}
          aria-label="Inspection controls"
        >
          <button
            className="panel-head"
            onClick={() => {
              panelToggled.current = true;
              setPanelOpen((o) => !o);
            }}
            aria-expanded={panelOpen}
            title={panelOpen ? "Fold the controls away" : "Show the inspection controls"}
          >
            <span>Inspect</span>
            <span className="panel-caret" aria-hidden>
              {panelOpen ? "−" : "+"}
            </span>
          </button>
          {panelOpen && (
            <div className="panel-body">
              <div className="panel-section">
                <h4>View</h4>
                {LOD_MODES.map(([mode, label, hint], i) => (
                  <button
                    key={mode}
                    className="btn small block panel-index"
                    title={hint}
                    onClick={() => flyTo(mode)}
                  >
                    <span className="idx" aria-hidden>
                      {["i", "ii", "iii"][i]}
                    </span>
                    {label}
                  </button>
                ))}
                <button
                  className="panel-link"
                  title="Re-frame the whole turntable"
                  onClick={() => setResetSignal((n) => n + 1)}
                >
                  ⌂ Reset camera
                </button>
              </div>
              <div className="panel-section">
                <h4>Stereo encoding</h4>
                {STEREO_VIEWS.map(([key, label, hint]) => (
                  <button
                    key={key}
                    className={`btn small block${view === key ? " active" : ""}`}
                    title={hint}
                    aria-pressed={view === key}
                    onClick={() => setView(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="panel-section">
                <h4>Inspection</h4>
                <label className="panel-check">
                  <input type="checkbox" checked={cutaway} onChange={(e) => setCutaway(e.target.checked)} />
                  Cutaway at stylus
                </label>
                <label className="panel-check">
                  <input type="checkbox" checked={guides} onChange={(e) => setGuides(e.target.checked)} />
                  Pitch guides
                </label>
                <label className="panel-check">
                  <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
                  Follow stylus
                </label>
                <label className="panel-check">
                  <input type="checkbox" checked={freeze} onChange={(e) => setFreeze(e.target.checked)} />
                  Freeze record
                </label>
                <label className="panel-slider" title="Only the audio wiggle is magnified; pitch stays true">
                  Audio zoom ×{Math.round(effectiveBoost)}
                  {effectiveBoost < audioBoostReq - 1 && " (max)"}
                  <input
                    type="range"
                    min={25}
                    max={1000}
                    step={25}
                    value={audioBoostReq}
                    onChange={(e) => setAudioBoostReq(Number(e.target.value))}
                  />
                </label>
              </div>
            </div>
          )}
        </aside>

        {/* ------------- closeable readout HUD (bottom-left) ------------- */}
        {showHud ? (
          <div className="groove-hud">
            <button
              className="hud-close"
              title="Hide readout"
              onClick={() => setShowHud(false)}
              aria-label="Hide readout"
            >
              ✕
            </button>
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
                {isFrozen() && " (frozen)"}
              </span>
            </div>
            <b>{geometry.meta.revolutions.toFixed(1)} turns</b> ·{" "}
            {geometry.meta.groove_length_m.toFixed(1)} m of groove · pitch{" "}
            {(geometry.meta.groove_pitch_um / 1000).toFixed(2)} mm (true scale) · peak excursion{" "}
            <b>{geometry.meta.peak_excursion_um.toFixed(1)} µm</b>
            <br />
            Scroll toward the stylus to enter the microscope · click the groove to play from that
            spot.
          </div>
        ) : (
          <button
            className="btn small hud-reopen"
            title="Show readout"
            onClick={() => setShowHud(true)}
          >
            ⓘ readout
          </button>
        )}

        {/* ------------- honest-scale disclosure (bottom-right) ------------- */}
        {microActive && (
          <div className="scale-label">{scaleLabel(effectiveBoost, config.stylus_size)}</div>
        )}
      </div>
    </div>
  );
}
