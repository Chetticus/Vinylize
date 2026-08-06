/**
 * Engineering Explorer — master-detail around the actual signal chain.
 *
 * The left rail is the pipeline itself: seven stages grouped into the three
 * physical phases (cutting the lacquer, the groove medium, playback), in
 * processing order, with live active/bypassed state from the DSP controls.
 * Selecting a stage fills the reading pane; sidebar concept links deep-link
 * here via store.explorerFocus.
 */

import { useEffect, useState } from "react";

import { useStore } from "../../state/store";
import type { ExplorerCard } from "../../types/api";

/** Pipeline phases (matches DESIGN.md §4: Phase A/B/C). */
const PHASES: Array<{ label: string; keys: string[] }> = [
  { label: "Phase A · Cutting the master", keys: ["riaa"] },
  { label: "Phase B · The groove medium", keys: ["stylus", "compliance"] },
  { label: "Phase C · Playback", keys: ["wow_flutter", "clicks", "crosstalk", "noise"] },
];

/** Monochrome stage glyphs — typographic, deliberately not emoji. */
const GLYPHS: Record<string, string> = {
  riaa: "∿",
  stylus: "◆",
  compliance: "≋",
  wow_flutter: "◐",
  clicks: "✳",
  crosstalk: "⇄",
  noise: "▒",
};

const SECTION_META: Array<{ field: keyof ExplorerCard; label: string }> = [
  { field: "physics", label: "The physics" },
  { field: "where_on_record", label: "Where it lives on a record" },
  { field: "why_unavoidable", label: "Why engineers can't eliminate it" },
];

export default function ExplorerTab() {
  const { processResult, analysis, explorerFocus, clearExplorerFocus, setTab } = useStore();
  const [selectedKey, setSelectedKey] = useState("stylus");

  // Sidebar deep links: honor the requested card, then clear the request.
  useEffect(() => {
    if (explorerFocus) {
      setSelectedKey(explorerFocus);
      clearExplorerFocus();
    }
  }, [explorerFocus, clearExplorerFocus]);

  if (!processResult) return null;
  const cards = processResult.cards;
  const byKey = new Map(cards.map((c) => [c.key, c]));
  const selected = byKey.get(selectedKey) ?? cards[0];
  const stageNumber = cards.findIndex((c) => c.key === selected.key) + 1;

  return (
    <div className="explorer-layout">
      {/* ------------------------- signal-chain rail ------------------------- */}
      <nav className="stage-rail" aria-label="Pipeline stages">
        <div className="rail-title">Signal chain</div>
        {PHASES.map((phase) => (
          <div className="rail-phase" key={phase.label}>
            <div className="rail-phase-label">{phase.label}</div>
            {phase.keys.map((key) => {
              const card = byKey.get(key);
              if (!card) return null;
              const idx = cards.findIndex((c) => c.key === key) + 1;
              return (
                <button
                  key={key}
                  className={
                    `rail-stage${card.key === selected.key ? " active" : ""}` +
                    `${card.enabled ? "" : " bypassed"}`
                  }
                  onClick={() => setSelectedKey(key)}
                >
                  <span className="rail-glyph" aria-hidden>
                    {GLYPHS[key] ?? "•"}
                  </span>
                  <span className="rail-text">
                    <span className="rail-name">{card.title}</span>
                    <span className="rail-sub">
                      {String(idx).padStart(2, "0")} · {card.enabled ? "active" : "bypassed"}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        ))}
        <p className="rail-footnote">
          Stages marked <em>bypassed</em> are switched off in DSP Controls — their card explains
          what you're <em>not</em> hearing.
        </p>
      </nav>

      {/* --------------------------- reading pane --------------------------- */}
      <article className="stage-detail" key={selected.key}>
        <header className="stage-header">
          <div className="stage-glyph" aria-hidden>
            {GLYPHS[selected.key] ?? "•"}
          </div>
          <div className="stage-heading">
            <div className="stage-kicker">
              Stage {String(stageNumber).padStart(2, "0")} of {String(cards.length).padStart(2, "0")}
              <span className={`stage-pill${selected.enabled ? " on" : ""}`}>
                {selected.enabled ? "active in your render" : "bypassed"}
              </span>
            </div>
            <h2>{selected.title}</h2>
            <p className="stage-sub">{selected.subtitle}</p>
          </div>
        </header>

        {SECTION_META.map(({ field, label }) => (
          <section className="stage-section" key={field}>
            <h4>{label}</h4>
            <p>{selected[field] as string}</p>
          </section>
        ))}

        {selected.your_track.length > 0 && (
          <section className="stage-section measured">
            <h4>
              Measured from your upload
              {analysis && <span className="measured-file"> · {analysis.filename}</span>}
            </h4>
            {selected.your_track.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </section>
        )}

        <footer className="stage-actions">
          <button className="btn small" onClick={() => setTab("controls")}>
            ⚙ Experiment with this stage in DSP Controls
          </button>
          <button className="btn small" onClick={() => setTab("compare")}>
            ⇄ Hear it in Compare
          </button>
        </footer>
      </article>
    </div>
  );
}
