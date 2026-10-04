import { useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";

import { useStore } from "../state/store";

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

export default function Sidebar() {
  const {
    analysis,
    library,
    examples,
    selectSession,
    upload,
    useDemo,
    useExample,
    loading,
    playing,
    openExplorerCard,
  } = useStore(useShallow((s) => ({
    analysis: s.analysis, library: s.library, examples: s.examples,
    selectSession: s.selectSession, upload: s.upload, useDemo: s.useDemo,
    useExample: s.useExample, loading: s.loading, playing: s.playing,
    openExplorerCard: s.openExplorerCard,
  })));
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const onFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (file) void upload(file);
  };
  const namedParts = analysis?.filename.split(" — ") ?? [];
  const nowTitle = namedParts.length > 1 ? namedParts.slice(1).join(" — ") : analysis?.filename;
  const nowArtist = namedParts.length > 1 ? namedParts[0] : null;

  return (
    <aside className="sidebar">
      <header className="brand">
        <div className="brand-mark" aria-hidden>V</div>
        <div>
          <h1>
            Vinyl<em>ize</em>
          </h1>
          <p>A small listening room for curious ears.</p>
        </div>
      </header>

      <section className={`now-spinning${analysis ? " occupied" : ""}`}>
        <span className="hand-label">On the turntable</span>
        <div className={`now-disc${playing ? " spinning" : ""}`} aria-hidden />
        <div className="now-copy">
          <strong title={analysis?.filename}>
            {nowTitle ?? "The house pressing"}
          </strong>
          <span>
            {analysis
              ? `${nowArtist ? `${nowArtist} · ` : ""}${analysis.clip_duration_s.toFixed(0)} sec · ${analysis.is_stereo ? "stereo" : "mono"}`
              : "The room is warm. Pick something below."}
          </span>
        </div>
      </section>

      {examples.length > 0 && (
        <section className="record-crate">
          <div className="crate-heading">
            <span>Records from the crate</span>
            <small>Pick one</small>
          </div>
          <ul className="example-list">
            {examples.map((ex, i) => {
              const name = ex.artist ? `${ex.artist} — ${ex.title}` : ex.title;
              const active = analysis?.filename === name;
              return (
                <li key={ex.id}>
                  <button
                    className={`example${active ? " active" : ""}`}
                    onClick={() => void useExample(ex.id)}
                    disabled={loading !== null || active}
                    aria-pressed={active}
                    title={active ? `${name} is on the platter` : `Put on ${name}`}
                  >
                    <span
                      className={`example-disc tone-${i % 3}${active && playing ? " spinning" : ""}`}
                      aria-hidden
                    />
                    <span className="example-text">
                      <span className="example-title">{ex.title}</span>
                      <span className="example-artist">{ex.artist ?? "Example record"}</span>
                    </span>
                    <span className="example-time">{formatTime(ex.duration_s)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="bring-your-own">
        <div className="side-title">
          <span>Bring your own</span>
          <small>Up to three minutes</small>
        </div>
        <div
          className={`upload-zone${dragging ? " dragging" : ""}`}
          onClick={() => fileInput.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            onFiles(e.dataTransfer.files);
          }}
        >
          <span className="upload-plus" aria-hidden>+</span>
          <span>
            <strong>Drop a song here</strong>
            MP3, WAV, FLAC or OGG
          </span>
          <input
            ref={fileInput}
            type="file"
            accept=".mp3,.wav,.flac,.ogg,audio/*"
            hidden
            onChange={(e) => onFiles(e.target.files)}
          />
        </div>
        <button className="house-demo" onClick={() => void useDemo()} disabled={loading !== null}>
          Or spin the little house demo <span aria-hidden>→</span>
        </button>
      </section>

      {library.length > 1 && (
        <section className="recent-stack">
          <div className="side-title">
            <span>Recently played</span>
            <small>{library.length} sleeves</small>
          </div>
          <ul className="library-list">
            {library.map((entry) => (
              <li key={entry.session_id}>
                <button
                  className={entry.session_id === analysis?.session_id ? "active" : ""}
                  onClick={() => void selectSession(entry.session_id)}
                  title={entry.filename}
                >
                  <span className="lib-name">{entry.filename}</span>
                  <span className="lib-meta">{entry.clip_duration_s.toFixed(0)} sec</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <button className="story-letter" onClick={() => openExplorerCard("prologue")}>
        <span className="story-stamp" aria-hidden>33⅓</span>
        <span>
          <small>From the record shop</small>
          <strong>Read the story of vinyl</strong>
        </span>
        <span className="letter-arrow" aria-hidden>↗</span>
      </button>

      <footer className="sidebar-signoff">
        Made for late-night listening<br />and passing the headphones around.
      </footer>
    </aside>
  );
}
