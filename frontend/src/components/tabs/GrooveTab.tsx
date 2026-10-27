import { memo, useCallback, useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";

import { useStore } from "../../state/store";
import { OMEGA } from "../groove/grooveMath";
import TurntableScene from "../groove/TurntableScene";
import { prepareVinylSurface } from "../groove/GrooveOverviewMaterial";
import { prepareKit } from "../groove/room/kit";
import { detectQuality } from "../groove/room/quality";
import type { AnalyzeResponse, GrooveGeometry, ProcessResponse } from "../../types/api";
import "./room.css";

interface SceneRecord {
  analysis: AnalyzeResponse;
  geometry: GrooveGeometry;
  processResult: ProcessResponse;
}

const HOUSE_SESSION_ID = "vinylize-house-record";

/** A quiet, client-only record that lets the listening room open before the
 * visitor chooses any audio. It follows the same units and physical scale as
 * backend geometry, but never asks the API for microscope detail. */
function makeHouseRecord(): SceneRecord {
  const n = 2048;
  const durationS = 54;
  const pitchMm = 0.25;
  const startRadiusMm = 146;
  const theta = new Float32Array(n);
  const radius = new Float32Array(n);
  const lateral = new Float32Array(n);
  const vertical = new Float32Array(n);
  const timeS = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1)) * durationS;
    const angle = OMEGA * t;
    timeS[i] = t;
    theta[i] = angle;
    radius[i] = (startRadiusMm - (pitchMm / (2 * Math.PI)) * angle) / 1000;
    // A near-silent handmade wobble keeps the texture from reading as a
    // sterile placeholder while remaining visibly calmer than a real song.
    lateral[i] = Math.sin(angle * 3.1) * 0.000002;
    vertical[i] = Math.sin(angle * 1.7 + 0.8) * 0.000001;
  }
  const revolutions = (OMEGA * durationS) / (2 * Math.PI);
  const meta = {
    n_points: n,
    peak_excursion_um: 2,
    groove_length_m: (2 * Math.PI * 142 * revolutions) / 1000,
    revolutions,
    start_radius_mm: startRadiusMm,
    groove_pitch_um: pitchMm * 1000,
    groove_half_width_um: 35,
  };
  const geometry: GrooveGeometry = { meta, theta, radius, lateral, vertical, timeS };
  const analysis: AnalyzeResponse = {
    session_id: HOUSE_SESSION_ID,
    sample_rate: 44100,
    n_channels: 2,
    is_stereo: true,
    full_duration_s: durationS,
    clip_duration_s: durationS,
    waveform: { mins: [], maxs: [] },
    filename: "Vinylize house record",
  };
  const processResult: ProcessResponse = {
    session_id: HOUSE_SESSION_ID,
    geometry: meta,
    cards: [],
    vinyl_url: "",
    original_url: "",
    geometry_url: "",
  };
  return { analysis, geometry, processResult };
}

const HOUSE_RECORD = makeHouseRecord();


function GrooveTab({ active = true }: { active?: boolean }) {
  const { liveGeometry, liveAnalysis, liveProcessResult, loading, seek, beginCue, cueTo, endCue } =
    useStore(useShallow((s) => ({
      liveGeometry: s.geometry, liveAnalysis: s.analysis, liveProcessResult: s.processResult,
      loading: s.loading !== null, seek: s.seek, beginCue: s.beginCue, cueTo: s.cueTo, endCue: s.endCue,
    })));

  const [sceneRecord, setSceneRecord] = useState<SceneRecord>(HOUSE_RECORD);
  const [kitFrac, setKitFrac] = useState(0);
  const [kitReady, setKitReady] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const roomReady = useCallback(() => setSceneReady(true), []);

  useEffect(() => {
    let alive = true;
    void Promise.all([
      prepareKit(detectQuality(), (f) => alive && setKitFrac(f)),
      prepareVinylSurface(HOUSE_RECORD.geometry),
    ]).then(() => alive && setKitReady(true));
    return () => { alive = false; };
  }, []);

  // Keep the previous record until the next surface is ready. This does not
  // subscribe to the audio clock: the room never re-renders on playback ticks.
  useEffect(() => {
    if (!liveGeometry || !liveAnalysis || !liveProcessResult ||
        liveAnalysis.session_id !== liveProcessResult.session_id) return;
    let alive = true;
    void prepareVinylSurface(liveGeometry).then(() => {
      if (alive) setSceneRecord({
        geometry: liveGeometry, analysis: liveAnalysis, processResult: liveProcessResult,
      });
    });
    return () => { alive = false; };
  }, [liveGeometry, liveAnalysis, liveProcessResult]);

  const house = sceneRecord.analysis.session_id === HOUSE_SESSION_ID;
  // Don't let the retained old disc seek the newly loaded audio during a swap.
  const cueEnabled = !house && !loading &&
    sceneRecord.analysis.session_id === liveProcessResult?.session_id;

  return (
    <div className="tab-content-inner room-content">
      <div className="groove-wrap">
        {kitReady && (
          <TurntableScene
            active={active}
            geometry={sceneRecord.geometry}
            filename={sceneRecord.analysis.filename}
            sessionId={sceneRecord.analysis.session_id}
            onReady={roomReady}
            onScrub={seek}
            cueEnabled={cueEnabled}
            onCueStart={beginCue}
            onCueMove={cueTo}
            onCueEnd={endCue}
          />
        )}
        {house && sceneReady && !loading && (
          <div className="room-welcome">
            <a href="#records">Choose a record to begin.</a>
          </div>
        )}
        {!sceneReady && (
          <div className="groove-loading" role="status" aria-live="polite">
            <div className="loading-disc" aria-hidden />
            <div className="loading-copy">
              <b>{kitReady ? "Opening the room…" : "Loading the room…"}</b>
              <div className="progress-track" aria-hidden>
                <div className="progress-fill" style={{ width: `${Math.round(kitReady ? 90 : kitFrac * 85)}%` }} />
              </div>
            </div>
          </div>
        )}
      </div>
      <p className="room-caption">
        <span className="pointer-help">Move your mouse to look around. Scroll to get closer.</span>
        <span className="touch-help">Drag to look around. Pinch to get closer.</span>
        <span className="acoustics-note">Room acoustics on vinyl</span>
      </p>
    </div>
  );
}

export default memo(GrooveTab);
