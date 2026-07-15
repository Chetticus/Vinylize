import { useRef, useState } from "react";

import { useStore } from "../state/store";

const CONCEPTS: Array<[string, string]> = [
  ["A groove is a velocity signal", "riaa"],
  ["Why the last track sounds worst", "stylus"],
  ["Where 'warmth' really comes from", "compliance"],
  ["The off-center hole you can hear", "wow_flutter"],
  ["Anatomy of a click", "clicks"],
  ["Two channels, one stylus", "crosstalk"],
  ["The medium's noise floor", "noise"],
];

export default function Sidebar() {
  const { analysis, library, selectSession, upload, useDemo, loading, setTab } = useStore();
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
          Upload a song and watch it become a vinyl record — every audible change traced to the
          physics that causes it.
        </p>
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
          Drop an <strong>MP3 / WAV</strong> here
          <br />
          or click to browse
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
            ▶ No file handy? Try the demo groove
          </button>
        </div>
        <p style={{ fontSize: 11.5, color: "var(--text-dim)", marginTop: 8 }}>
          Up to the first 3 minutes are cut to the disc.
        </p>
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
          <p style={{ fontSize: 11, color: "var(--text-dim)", margin: "6px 0 0" }}>
            Recent clips stay on the platter shelf — click one to put it back on.
          </p>
        </div>
      )}

      <div className="side-section">
        <h2>Vinyl engineering</h2>
        <ul className="concept-list">
          {CONCEPTS.map(([label]) => (
            <li key={label} onClick={() => setTab("explorer")}>
              {label}
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
