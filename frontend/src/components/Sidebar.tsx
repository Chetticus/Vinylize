import { useRef, useState } from "react";

import { useStore } from "../state/store";

/** Sidebar jump-points into The Vinyl Story (keys match content/vinylStory). */
const CONCEPTS: Array<[string, string]> = [
  ["Start here — the needle drops", "prologue"],
  ["Before music could be kept", "before"],
  ["The first sounds played back", "first-sounds"],
  ["From cylinders to discs", "discs"],
  ["The birth of the modern LP", "modern-vinyl"],
  ["Inside the groove", "inside-groove"],
  ["Why vinyl sounds like vinyl", "why-sounds"],
  ["When the record became an instrument", "changes-music"],
  ["The record that refused to disappear", "refused"],
];

export default function Sidebar() {
  const { analysis, library, selectSession, upload, useDemo, loading, openExplorerCard } =
    useStore();
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const onFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (file) void upload(file);
  };

  return (
    <aside className="sidebar">
      <div className="brand">
        <h1>
          Vinyl<em>ize</em>
        </h1>
        <p>
          Cut any song to a virtual record, then hear what the needle makes of it.
        </p>
        <div className="brand-credit">Long-playing · 33⅓ rpm · microgroove</div>
      </div>

      <div className="side-section">
        <h2>Your record</h2>
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
          <strong>Drop a record in</strong>
          MP3 or WAV — or click to browse
          <input
            ref={fileInput}
            type="file"
            accept=".mp3,.wav,.flac,.ogg,audio/*"
            hidden
            onChange={(e) => onFiles(e.target.files)}
          />
        </div>
        <div style={{ marginTop: 10, textAlign: "center" }}>
          <button className="btn" onClick={() => void useDemo()} disabled={loading !== null}>
            ▶ Play the demo record
          </button>
        </div>
        <p className="slot-note">Up to the first three minutes are cut to the disc.</p>
      </div>

      {analysis && (
        <div className="file-info">
          <div className="name" title={analysis.filename}>
            {analysis.filename}
          </div>
          <dl>
            <dt>Clip</dt>
            <dd>{analysis.clip_duration_s.toFixed(1)} s of {analysis.full_duration_s.toFixed(1)} s</dd>
            <dt>Sample rate</dt>
            <dd>{(analysis.sample_rate / 1000).toFixed(1)} kHz</dd>
            <dt>Channels</dt>
            <dd>{analysis.is_stereo ? "stereo" : "mono"}</dd>
          </dl>
        </div>
      )}

      {library.length > 1 && (
        <div className="side-section">
          <h2>Library</h2>
          <ul className="library-list">
            {library.map((entry) => (
              <li
                key={entry.session_id}
                className={entry.session_id === analysis?.session_id ? "active" : ""}
                onClick={() => void selectSession(entry.session_id)}
                title={entry.filename}
              >
                <span className="lib-name">{entry.filename}</span>
                <span className="lib-meta">
                  {entry.clip_duration_s.toFixed(0)} s · {entry.is_stereo ? "stereo" : "mono"}
                </span>
              </li>
            ))}
          </ul>
          <p className="slot-note">Recent clips stay on the shelf — click one to play it again.</p>
        </div>
      )}

      <div className="side-section">
        <h2>The story</h2>
        <ul className="concept-list">
          {CONCEPTS.map(([label, cardKey]) => (
            <li key={cardKey} onClick={() => openExplorerCard(cardKey)}>
              <span>{label}</span>
              <span className="concept-go" aria-hidden>
                ›
              </span>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
