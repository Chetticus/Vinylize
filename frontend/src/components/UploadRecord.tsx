import { useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useStore } from "../state/store";

/** The collection's primary action, with a drop target while dragging. */
export default function UploadRecord() {
  const { upload, useDemo, loading } = useStore(useShallow((s) => ({
    upload: s.upload, useDemo: s.useDemo, loading: s.loading !== null,
  })));
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    let depth = 0;
    const isFile = (event: DragEvent) => event.dataTransfer?.types.includes("Files");
    const enter = (event: DragEvent) => {
      if (!isFile(event)) return;
      event.preventDefault();
      depth++;
      if (!loading) setDragging(true);
    };
    const over = (event: DragEvent) => {
      if (!isFile(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = loading ? "none" : "copy";
    };
    const leave = () => { if (--depth <= 0) { depth = 0; setDragging(false); } };
    const drop = (event: DragEvent) => {
      if (!isFile(event)) return;
      event.preventDefault();
      depth = 0;
      setDragging(false);
      const file = event.dataTransfer?.files[0];
      if (file && !loading) void upload(file);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, [loading, upload]);

  return (
    <div className="own-record">
      <button className="upload-song-button" onClick={() => input.current?.click()} disabled={loading} aria-describedby="upload-guidance">
        Vinylize your own song <span aria-hidden>↗</span>
      </button>
      <p className="upload-guidance" id="upload-guidance">Upload a song and hear it on vinyl. MP3, WAV, FLAC or OGG. Up to three minutes.</p>
      <input ref={input} type="file" accept=".mp3,.wav,.flac,.ogg,audio/*" hidden aria-label="Choose a song"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file && !loading) void upload(file);
          event.target.value = "";
        }} />
      <details className="test-record">
        <summary>No song handy?</summary>
        <button className="text-link" onClick={() => void useDemo()} disabled={loading}>Try the short test recording</button>
      </details>
      {dragging && <div className="file-drop-hint" role="status">Drop your song anywhere here.</div>}
    </div>
  );
}
