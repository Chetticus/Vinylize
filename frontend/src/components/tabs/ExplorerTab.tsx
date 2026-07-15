import { useState } from "react";

import { useStore } from "../../state/store";

export default function ExplorerTab() {
  const { processResult } = useStore();
  const [open, setOpen] = useState<string | null>("stylus");
  if (!processResult) return null;

  return (
    <div>
      <p className="sub" style={{ color: "var(--text-dim)", fontSize: 13, margin: "0 0 14px" }}>
        Every stage of the simulation, explained — with measurements taken from <b>your clip</b>,
        under the current DSP Controls settings. Amber boxes are specific to your upload.
      </p>
      {processResult.cards.map((card) => {
        const isOpen = open === card.key;
        return (
          <div key={card.key} className={`card${card.enabled ? "" : " disabled"}`}>
            <header onClick={() => setOpen(isOpen ? null : card.key)}>
              <h3>{card.title}</h3>
              <span className="sub">{card.subtitle}</span>
              <span className={`badge${card.enabled ? " on" : ""}`}>
                {card.enabled ? "active" : "stage disabled"}
              </span>
            </header>
            {isOpen && (
              <div className="body">
                <h4>The physics</h4>
                <p>{card.physics}</p>
                <h4>Where it lives on a record</h4>
                <p>{card.where_on_record}</p>
                <h4>Why engineers can't eliminate it</h4>
                <p>{card.why_unavoidable}</p>
                {card.your_track.length > 0 && (
                  <>
                    <h4>In your track</h4>
                    <div className="your-track">
                      {card.your_track.map((line, i) => (
                        <p key={i}>{line}</p>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
