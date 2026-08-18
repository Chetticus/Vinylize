/**
 * The Vinyl Story — a short illustrated history of the record.
 *
 * Master-detail: the left rail is a timeline grouped into three eras, the
 * right pane is the chapter as a piece of writing. Content lives in
 * content/vinylStory.ts; sidebar links deep-link to a chapter through
 * store.explorerFocus.
 *
 * This tab used to explain the DSP pipeline stage by stage. It now tells the
 * history instead — the physics is something the app should let you *hear*,
 * not something a visitor should have to read a manual about.
 */

import { useEffect, useState } from "react";

import { useStore } from "../../state/store";
import { ALL_CHAPTERS, VINYL_STORY } from "../../content/vinylStory";

export default function ExplorerTab() {
  const { explorerFocus, clearExplorerFocus, setTab } = useStore();
  const [selectedKey, setSelectedKey] = useState(ALL_CHAPTERS[0].key);

  // Sidebar deep links: honour the requested chapter, then clear the request.
  useEffect(() => {
    if (explorerFocus) {
      if (ALL_CHAPTERS.some((c) => c.key === explorerFocus)) setSelectedKey(explorerFocus);
      clearExplorerFocus();
    }
  }, [explorerFocus, clearExplorerFocus]);

  const selected = ALL_CHAPTERS.find((c) => c.key === selectedKey) ?? ALL_CHAPTERS[0];
  const index = ALL_CHAPTERS.findIndex((c) => c.key === selected.key);
  const era = VINYL_STORY.find((e) => e.chapters.some((c) => c.key === selected.key));
  const next = ALL_CHAPTERS[index + 1];

  return (
    <div className="explorer-layout">
      {/* ------------------------------ timeline ------------------------------ */}
      <nav className="stage-rail" aria-label="Vinyl history timeline">
        <div className="rail-title">A short history</div>
        {VINYL_STORY.map((eraGroup) => (
          <div className="rail-phase" key={eraGroup.label}>
            <div className="rail-phase-label">{eraGroup.label}</div>
            {eraGroup.chapters.map((chapter) => (
              <button
                key={chapter.key}
                className={`rail-stage${chapter.key === selected.key ? " active" : ""}`}
                onClick={() => setSelectedKey(chapter.key)}
              >
                <span className="rail-glyph" aria-hidden>
                  {chapter.glyph}
                </span>
                <span className="rail-text">
                  <span className="rail-name">{chapter.title}</span>
                  <span className="rail-sub">{chapter.year}</span>
                </span>
              </button>
            ))}
          </div>
        ))}
        <p className="rail-footnote">
          Roughly 150 years of a format that has been declared obsolete at least twice.
        </p>
      </nav>

      {/* ------------------------------- chapter ------------------------------- */}
      <article className="stage-detail" key={selected.key}>
        <header className="stage-header">
          <div className="stage-glyph" aria-hidden>
            {selected.glyph}
          </div>
          <div className="stage-heading">
            <div className="stage-kicker">
              {era?.label ?? ""}
              <span className="stage-pill">
                Chapter {String(index + 1).padStart(2, "0")} of{" "}
                {String(ALL_CHAPTERS.length).padStart(2, "0")}
              </span>
            </div>
            <div className="story-year">{selected.year}</div>
            <h2>{selected.title}</h2>
            <p className="stage-sub">{selected.subtitle}</p>
          </div>
        </header>

        <section className="stage-section">
          {selected.paragraphs.map((text, i) => (
            <p key={i}>{text}</p>
          ))}
        </section>

        {selected.fact && (
          <section className="stage-section footnote-fact">
            <p>{selected.fact}</p>
          </section>
        )}

        {selected.yourRecord && (
          <section className="stage-section measured">
            <h4>On your record</h4>
            <p>{selected.yourRecord}</p>
          </section>
        )}

        <footer className="stage-actions">
          {next && (
            <button className="btn small" onClick={() => setSelectedKey(next.key)}>
              {next.year} · {next.title} ›
            </button>
          )}
          <button className="btn small" onClick={() => setTab("compare")}>
            ⇄ Back to listening
          </button>
        </footer>
      </article>
    </div>
  );
}
