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
  ["explorer", "Engineering Explorer"],
];

function Placeholder() {
  return (
    <div className="placeholder">
      <div className="disc" />
      <div>
        <b>No record on the platter.</b>
        <br />
        Upload a song (or press “Try the demo groove”) to cut your first disc.
      </div>
    </div>
  );
}

export default function App() {
  const { activeTab, setTab, analysis, processResult, loading, progressFrac, error } = useStore();
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
              disabled={!ready && key !== "waveform"}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className={`tab-content${activeTab === "groove" ? " no-scroll" : ""}`}>
          {!ready ? (
            <Placeholder />
          ) : (
            <>
              {activeTab === "waveform" && <WaveformTab />}
              {activeTab === "groove" && <GrooveTab />}
              {activeTab === "compare" && <CompareTab />}
              {activeTab === "explorer" && <ExplorerTab />}
            </>
          )}
        </div>

        <Transport />
      </div>

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
