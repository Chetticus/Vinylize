import { useShallow } from "zustand/react/shallow";
import { useStore } from "../state/store";
import { RECORD_NOTES } from "../content/records";
import UploadRecord from "./UploadRecord";
import "./collection.css";

function formatTime(s: number): string {
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

export default function Sidebar() {
  const { analysis, library, examples, selectSession, useExample, loading, processResult } =
    useStore(useShallow((s) => ({
      analysis: s.analysis, library: s.library, examples: s.examples,
      selectSession: s.selectSession,
      useExample: s.useExample, loading: s.loading, processResult: s.processResult,
    })));
  return (
    <aside className="collection" aria-label="Record collection">
      <h2>A few records</h2>
      <p className="collection-invitation">Pick a sleeve. Put something on.</p>
      <ol className="record-selection">
        {examples.map((ex, index) => {
          const name = ex.artist ? `${ex.artist} — ${ex.title}` : ex.title;
          const selected = analysis?.filename === name;
          const notes = RECORD_NOTES[ex.id];
          return (
            <li key={ex.id}>
              <button className={`record-choice${selected ? " selected" : ""}`}
                onClick={() => void useExample(ex.id)}
                disabled={loading !== null || (selected && processResult !== null)}
                aria-pressed={selected} aria-label={`${ex.title} by ${ex.artist ?? "unknown artist"}`}>
                <span className="sleeve">
                  {notes ? <img src={notes.cover} alt={`${notes.album} sleeve`} width="400" height="400" /> :
                    <span className="sleeve-fallback" aria-hidden>♪</span>}
                </span>
                <span className="record-writing">
                  <span className="record-title">{ex.title}</span>
                  <span className="record-artist">{ex.artist} <span aria-hidden>·</span> {formatTime(ex.duration_s)}</span>
                  {notes && <span className="record-note">{notes.note}</span>}
                </span>
                <span className="record-number" aria-hidden>{String(index + 1).padStart(2, "0")}</span>
              </button>
            </li>
          );
        })}
      </ol>
      {examples.length === 0 && <p className="collection-wait">Getting the records… You can also play your own file below.</p>}
      <div className="collection-note">
        <p>Just a side project for me and my friends. Three songs, a turntable, and a way to hear digital next to vinyl.</p>
        <p>Try both versions of the same bit of a song. The room and the warmth belong to vinyl.</p>
      </div>
      <UploadRecord />
      {library.length > 1 && (
        <section className="recent-records" aria-label="Recently played">
          <h3>Played earlier</h3>
          <ul>
            {library.filter((entry) => entry.session_id !== analysis?.session_id).map((entry) => (
              <li key={entry.session_id}>
                <button disabled={loading !== null} onClick={() => void selectSession(entry.session_id)}>{entry.filename}</button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  );
}
