import { useEffect } from "react";

import Sidebar from "./components/Sidebar";
import Transport from "./components/Transport";
import CompareTab from "./components/tabs/CompareTab";
import ExplorerTab from "./components/tabs/ExplorerTab";
import GrooveTab from "./components/tabs/GrooveTab";
import WaveformTab from "./components/tabs/WaveformTab";
import { useStore, type TabKey } from "./state/store";

const TABS: Array<[TabKey, string]> = [
  ["waveform", "Waveform"],
  ["groove", "3D Groove"],
  ["compare", "Compare"],
  ["explorer", "The Vinyl Story"],
];

function Placeholder() {
  return (
    <div className="placeholder">
      <div className="disc" />
      <div>
        <b>No record on the platter.</b>
        <br />
        Upload a song (or press “Try the demo groove”) to cut your first disc.
        <br />
        <span style={{ fontSize: 12.5 }}>
          Nothing to play yet? <b>The Vinyl Story</b> is readable right now.
        </span>
      </div>
    </div>
  );
}

export default function App() {
  const { activeTab, setTab, analysis, processResult, loading, progressFrac, error, offline, checkEngine } =
    useStore();

  // Probe once on load, so a missing engine is announced up front rather
  // than discovered when someone clicks play.
  useEffect(() => {
    void checkEngine();
  }, [checkEngine]);
  const ready = analysis !== null && processResult !== null;

  return (
    <div className="app">
      <Sidebar />
      <div className="main">
        <nav className="tabbar">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              className={activeTab === key ? "active" : ""}
              onClick={() => setTab(key)}
              // The Vinyl Story is reading material, not a readout: it needs
              // no upload and stays available on an empty platter.
              disabled={!ready && key !== "waveform" && key !== "explorer"}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className={`tab-content${activeTab === "groove" ? " no-scroll" : ""}`}>
          {activeTab === "explorer" ? (
            <ExplorerTab />
          ) : !ready ? (
            <Placeholder />
          ) : (
            <>
              {activeTab === "waveform" && <WaveformTab />}
              {activeTab === "groove" && <GrooveTab />}
              {activeTab === "compare" && <CompareTab />}
            </>
          )}
        </div>

        <Transport />
      </div>

      {offline && (
        <div className="offline-notice" role="alert">
          <div className="offline-mark" aria-hidden>
            ⚠
          </div>
          <div className="offline-body">
            <h4>{offline.missing === "engine" ? "The audio engine is not running" : "The app server is not reachable"}</h4>
            <p>{offline.message}</p>
          </div>
          <button className="btn small" onClick={() => void checkEngine()}>
            Try again
          </button>
        </div>
      )}

      <div className="statusbar">
        {loading && (
          <div className="status">
            <span className="spinner" />
            <div className="status-body">
              <div>
                {loading}
                {progressFrac !== null && ` — ${Math.round(progressFrac * 100)}%`}
              </div>
              {progressFrac !== null && (
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${progressFrac * 100}%` }} />
                </div>
              )}
            </div>
          </div>
        )}
        {error && <div className="status error">⚠ {error}</div>}
      </div>
    </div>
  );
}
