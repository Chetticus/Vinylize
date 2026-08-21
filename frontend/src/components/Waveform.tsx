/**
 * Canvas min/max peak waveform. Draws the pre-decimated envelope (never raw
 * samples) plus an optional playhead line.
 */

import { useEffect, useRef } from "react";

interface Props {
  mins: number[];
  maxs: number[];
  color?: string;
  /** Playhead position as fraction of clip length (0-1), or undefined. */
  playhead?: number;
  onSeek?: (fraction: number) => void;
}

export default function Waveform({ mins, maxs, color = "#d4744b", playhead, onSeek }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const g = canvas.getContext("2d")!;
    g.scale(dpr, dpr);
    g.clearRect(0, 0, w, h);

    const mid = h / 2;
    const n = mins.length;
    g.fillStyle = color;
    g.globalAlpha = 0.9;
    for (let i = 0; i < n; i++) {
      const x = (i / n) * w;
      const barW = Math.max(w / n - 0.5, 0.5);
      const y1 = mid - maxs[i] * (mid - 2);
      const y2 = mid - mins[i] * (mid - 2);
      g.fillRect(x, y1, barW, Math.max(y2 - y1, 1));
    }
    g.globalAlpha = 0.35;
    g.fillRect(0, mid - 0.5, w, 1); // center line

    if (playhead !== undefined) {
      g.globalAlpha = 1;
      g.fillStyle = "#ede1c7";
      g.fillRect(playhead * w - 1, 0, 2, h);
    }
  }, [mins, maxs, color, playhead]);

  return (
    <canvas
      className="waveform"
      ref={ref}
      onClick={(e) => {
        if (!onSeek) return;
        const rect = e.currentTarget.getBoundingClientRect();
        onSeek((e.clientX - rect.left) / rect.width);
      }}
    />
  );
}
