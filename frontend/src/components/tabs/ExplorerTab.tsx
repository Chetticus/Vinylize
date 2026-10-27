/**
 * The Story of Vinyl — a guided history, readable with nothing on the platter.
 *
 * Layout: a left rail acting as the journey's table of contents (acts, each
 * holding a prologue / chapters / epilogue), and a reading pane that lays
 * every section out in the same four-beat rhythm:
 *
 *   1. The moment        — a human scene, set in larger type
 *   2. What changed      — the historical idea
 *   3. Hear the difference — an audio demonstration
 *   4. Explore the object  — an interaction in the 3D room
 *
 * The last two beats carry actions into the app. When no record is loaded
 * those actions become a single "cut the demo record" button instead of a
 * dead link, so the story works as an entry point rather than a reward for
 * having already uploaded something.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";

import { useStore } from "../../state/store";
import {
  ALL_CHAPTERS,
  VINYL_STORY,
  type StoryBeat,
} from "../../content/vinylStory";
import "./story.css";

/** One beat's optional call to action, degraded gracefully with no record. */
function BeatAction({ beat }: { beat: StoryBeat }) {
  const { analysis, processResult, loading, setTab, useDemo } = useStore(useShallow((s) => ({
    analysis: s.analysis, processResult: s.processResult, loading: s.loading,
    setTab: s.setTab, useDemo: s.useDemo,
  })));
  const ready = analysis !== null && processResult !== null;

  if (!beat.action) return null;
  if (!ready) {
    return (
      <button className="btn small" disabled={loading !== null} onClick={() => void useDemo()}>
        ▶ Cut the demo record to try this
      </button>
    );
  }
  return (
    <button className="btn small" onClick={() => setTab(beat.action!.target)}>
      {beat.action.label}
    </button>
  );
}

function Beat({
  kicker,
  beat,
  variant,
}: {
  kicker: string;
  beat: StoryBeat;
  variant: "hear" | "explore";
}) {
  return (
    <section className={`story-beat beat-${variant}`}>
      <h4>{kicker}</h4>
      <p>{beat.text}</p>
      <BeatAction beat={beat} />
    </section>
  );
}

export default function ExplorerTab() {
  const { explorerFocus, clearExplorerFocus } = useStore(useShallow((s) => ({
    explorerFocus: s.explorerFocus, clearExplorerFocus: s.clearExplorerFocus,
  })));
  const [selectedKey, setSelectedKey] = useState(ALL_CHAPTERS[0].key);
  const contents = useRef<HTMLDetailsElement>(null);

  // Sidebar deep links: honour the requested chapter, then clear the request.
  useEffect(() => {
    if (explorerFocus) {
      if (ALL_CHAPTERS.some((c) => c.key === explorerFocus)) setSelectedKey(explorerFocus);
      clearExplorerFocus();
    }
  }, [explorerFocus, clearExplorerFocus]);

  const { selected, index } = useMemo(() => {
    const i = Math.max(
      0,
      ALL_CHAPTERS.findIndex((c) => c.key === selectedKey),
    );
    return { selected: ALL_CHAPTERS[i], index: i };
  }, [selectedKey]);

  const prev = index > 0 ? ALL_CHAPTERS[index - 1] : null;
  const next = index < ALL_CHAPTERS.length - 1 ? ALL_CHAPTERS[index + 1] : null;

  const goto = (key: string) => {
    setSelectedKey(key);
    if (contents.current) contents.current.open = false;
    document.querySelector(".story-read")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="story-layout">
      {/* ------------------------ journey / contents ------------------------ */}
      <details className="story-contents" ref={contents}>
      <summary>Browse the story</summary>
      <nav className="story-rail" aria-label="Story contents">
        {VINYL_STORY.map((act) => (
          <div className="rail-phase" key={act.label}>
            <div className="rail-phase-label">{act.label}</div>
            {act.chapters.map((chapter) => (
              <button
                key={chapter.key}
                className={`rail-stage${chapter.key === selected.key ? " active" : ""}`}
                aria-current={chapter.key === selected.key ? "page" : undefined}
                onClick={() => goto(chapter.key)}
              >
                <span className="rail-text">
                  <span className="rail-name">{chapter.title}</span>
                </span>
              </button>
            ))}
          </div>
        ))}
      </nav>
      </details>

      {/* ------------------------------ chapter ------------------------------ */}
      <article className="story-read" key={selected.key}>
        <header className={`story-header kind-${selected.kind}`}>
          <div>
            <div className="story-kicker">
              <span className="story-pill">{selected.label}</span>
            </div>
            <h2>{selected.title}</h2>
            <p className="story-sub">{selected.subtitle}</p>
          </div>
        </header>

        <section className="story-beat beat-moment">
          <h4>The moment</h4>
          {selected.moment.map((text, i) => (
            <p key={i}>{text}</p>
          ))}
        </section>

        <section className="story-beat beat-changed">
          <h4>What changed</h4>
          {selected.whatChanged.map((text, i) => (
            <p key={i}>{text}</p>
          ))}
        </section>

        {selected.hear && (
          <Beat kicker="Hear the difference" beat={selected.hear} variant="hear" />
        )}
        {selected.explore && (
          <Beat kicker="Explore the object" beat={selected.explore} variant="explore" />
        )}

        {selected.question && <p className="story-question">{selected.question}</p>}

        {selected.sources && selected.sources.length > 0 && (
          <details className="story-sources">
            <summary>Sources</summary>
            <ul>
              {selected.sources.map((src) => (
                <li key={src.url}>
                  <a href={src.url} target="_blank" rel="noreferrer noopener">
                    {src.label}
                  </a>
                </li>
              ))}
            </ul>
          </details>
        )}

        <footer className="story-nav">
          {prev ? (
            <button className="btn small" onClick={() => goto(prev.key)}>
              ‹ {prev.title}
            </button>
          ) : (
            <span />
          )}
          {next ? (
            <button className="btn small primary" onClick={() => goto(next.key)}>
              {next.title} ›
            </button>
          ) : (
            <span className="story-end">The end — put something else on the platter.</span>
          )}
        </footer>
      </article>
    </div>
  );
}
