/**
 * Interactive DSP controls. Changes re-run the backend pipeline (debounced);
 * playback position survives re-processing, so users can hold a note and
 * sweep a slider to hear the physics move.
 */

import { useEffect, useRef } from "react";

import { useStore } from "../../state/store";
import type { ProcessConfig } from "../../types/api";

interface StageRow {
  key: keyof ProcessConfig;
  label: string;
  hint: string;
  param?: {
    key: keyof ProcessConfig;
    min: number;
    max: number;
    step: number;
    fmt: (v: number) => string;
  };
}

const STAGES: StageRow[] = [
  {
    key: "riaa",
    label: "RIAA equalization",
    hint: "Disable to cut 'flat' — then listen to what the noise stage does",
  },
  {
    key: "stylus",
    label: "Stylus tracing (incl. inner-groove)",
    hint: "Contact-patch averaging + mistracking",
    param: { key: "stylus_size", min: 0.25, max: 4, step: 0.25, fmt: (v) => `×${v} tip` },
  },
  {
    key: "compliance",
    label: "Harmonic saturation",
    hint: "Slope-keyed soft compression — 'warmth'",
    param: { key: "saturation_drive", min: 0, max: 8, step: 0.25, fmt: (v) => `drive ${v}` },
  },
  {
    key: "wow_flutter",
    label: "Wow & flutter",
    hint: "Off-center hole + motor ripple",
    param: { key: "wow_depth", min: 0, max: 10, step: 0.5, fmt: (v) => `×${v} depth` },
  },
  {
    key: "clicks",
    label: "Clicks & pops",
    hint: "Poisson defects per meter of groove",
    param: { key: "click_density", min: 0, max: 10, step: 0.5, fmt: (v) => `×${v} dust` },
  },
  {
    key: "crosstalk",
    label: "Channel crosstalk",
    hint: "Imperfect 45/45 wall separation",
    param: { key: "crosstalk_amount", min: 0, max: 10, step: 0.5, fmt: (v) => `×${v}` },
  },
  {
    key: "noise",
    label: "Surface noise & rumble",
    hint: "Pink groove-wall roughness + bearing rumble",
    param: { key: "noise_level", min: 0, max: 10, step: 0.5, fmt: (v) => `×${v}` },
  },
];

export default function ControlsTab() {
  const { config, setConfig, reprocess, analysis, loading } = useStore();
  const debounce = useRef<number | undefined>(undefined);

  // Debounced re-process on any config change.
  useEffect(() => {
    if (!analysis) return;
    window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(() => void reprocess(), 450);
    return () => window.clearTimeout(debounce.current);
  }, [config, analysis, reprocess]);

  return (
    <div>
      <div className="panel">
        <h3>Groove position — the inner-groove experiment</h3>
        <p className="sub">
          The groove travels inward ~8 mm per minute of music, so <b>where</b> the clip sits on
          the disc is the experiment. Slide toward the label: groove speed drops from 51 to 21
          cm/s and the same stylus must read the same music from ever-shorter wavelengths. (Long
          clips are auto-placed far enough out to fit — the Explorer reports the radius actually
          cut.)
        </p>
        <div className="control-row">
          <div className="label">
            Start radius
            <span className="hint">146 mm = outer edge · 62 mm = last track</span>
          </div>
          <input
            type="range"
            min={62}
            max={146}
            step={1}
            value={config.start_radius_mm}
            onChange={(e) => setConfig({ start_radius_mm: Number(e.target.value) })}
          />
          <div className="value">{config.start_radius_mm} mm</div>
        </div>
      </div>

      <div className="panel">
        <h3>Physical stages</h3>
        <p className="sub">
          Every toggle is one physical mechanism. <b>1× = pristine-pressing reality</b>; the
          defaults model a well-worn record under a worn stylus so the character is
          unmistakable even at the rim's fast groove speed — dial back toward 1× to hear how
          subtle real vinyl can be. Audio and the 3D groove update together.
          {loading && " Re-simulating…"}
        </p>
        {STAGES.map((stage) => {
          const enabled = config[stage.key] as boolean;
          return (
            <div className="control-row" key={stage.key}>
              <input
                type="checkbox"
                className="toggle"
                checked={enabled}
                onChange={(e) => setConfig({ [stage.key]: e.target.checked })}
              />
              <div className="label">
                {stage.label}
                <span className="hint">{stage.hint}</span>
              </div>
              {stage.param ? (
                <>
                  <input
                    type="range"
                    min={stage.param.min}
                    max={stage.param.max}
                    step={stage.param.step}
                    value={config[stage.param.key] as number}
                    disabled={!enabled}
                    onChange={(e) => setConfig({ [stage.param!.key]: Number(e.target.value) })}
                  />
                  <div className="value">{stage.param.fmt(config[stage.param.key] as number)}</div>
                </>
              ) : (
                <>
                  <div style={{ flex: 1 }} />
                  <div className="value" />
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
