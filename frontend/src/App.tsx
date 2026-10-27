import { lazy, Suspense, useEffect } from "react";
import { useShallow } from "zustand/react/shallow";

import Sidebar from "./components/Sidebar";
import Transport from "./components/Transport";
const ExplorerTab = lazy(() => import("./components/tabs/ExplorerTab"));
const GrooveTab = lazy(() => import("./components/tabs/GrooveTab"));
import { useStore, type TabKey } from "./state/store";

const TABS: Array<[TabKey, string]> = [
  ["groove", "Listen"],
  ["explorer", "About vinyl"],
];

export default function App() {
  const { activeTab, setTab, loading, progressFrac, error, offline, checkEngine } =
    useStore(useShallow((s) => ({
      activeTab: s.activeTab, setTab: s.setTab, loading: s.loading,
      progressFrac: s.progressFrac, error: s.error, offline: s.offline, checkEngine: s.checkEngine,
    })));

  // Probe once on load, so a missing engine is announced up front rather
  // than discovered when someone clicks play.
  useEffect(() => {
    void checkEngine();
  }, [checkEngine]);

  return (
    <div className="app" data-page={activeTab}>
      <a className="skip-link" href="#main-content">Skip to the room</a>
      <header className="site-header">
        <h1><button className="wordmark" onClick={() => setTab("groove")} aria-label="Vinylize — listening room">vinylize</button></h1>
        <nav className="site-nav" aria-label="Main navigation">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              className={activeTab === key ? "active" : ""}
              aria-current={activeTab === key ? "page" : undefined}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      <div className="listening-layout">
      <Sidebar />
      <main className="main" id="main-content" tabIndex={-1}>
        <div className={`tab-content${activeTab === "groove" ? " no-scroll" : ""}`}>
          {/* Keep the GPU resources alive across pages, but stop rendering
              while the room is out of view. */}
          <div className="room-page" hidden={activeTab !== "groove"}>
            <Suspense fallback={<div className="placeholder">Opening the listening room…</div>}>
              <GrooveTab active={activeTab === "groove"} />
            </Suspense>
          </div>
          {activeTab === "explorer" && (
            <Suspense fallback={<div className="placeholder">Opening the story…</div>}>
              <ExplorerTab />
            </Suspense>
          )}
        </div>

        <Transport />

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

      <div className="statusbar" role="status" aria-live="polite" aria-atomic="true">
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
        {error && <div className="status error">{error}</div>}
      </div>
      </main>
      </div>
      <footer className="site-footer">A side project for me and my friends. Headphones welcome.</footer>
    </div>
  );
}
