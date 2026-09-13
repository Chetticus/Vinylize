/**
 * Development-only render capture.
 *
 * Art-directing a 3D room needs actual pictures of it, and an embedded preview
 * pane that is not being composited never produces animation frames. This
 * bridge drives R3F manually instead: it poses the camera, steps the frame
 * loop (so record rotation, tonearm IK and camera damping all run), renders at
 * a fixed resolution, and posts the JPEG to a local receiver. It is how the
 * screenshots in docs/screenshots were produced.
 *
 * Mounted only when import.meta.env.DEV is true — it never ships in a
 * production build.
 */

import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";

import { useStore } from "../../state/store";
import { poseFor, type LodMode } from "./grooveLod";
import { contact } from "./recordMotion";

interface CaptureOptions {
  /** File name; prefix with "docs/" to write into docs/screenshots. */
  name: string;
  width?: number;
  height?: number;
  position?: [number, number, number];
  target?: [number, number, number];
  /** Use a preset pose (aimed at the live stylus contact) instead. */
  mode?: LodMode;
  room?: boolean;
  /** Frames to step before rendering (lets damping and IK settle). */
  frames?: number;
  /** Wall-clock wait between two frame bursts, for async work such as the
   * microscope fetching groove windows after the camera closes in. */
  waitMs?: number;
  quality?: number;
  /** Receiver endpoint; defaults to the local capture server. */
  endpoint?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * ResizeObserver that also reports once, immediately, on observe().
 *
 * A document that is not being rendered (an embedded preview pane that is
 * hidden) never runs the rendering steps that deliver ResizeObserver
 * callbacks, so R3F's canvas would never learn its size and the scene would
 * never mount. Reporting the current box on observe() fixes that; in a
 * normal visible page the extra first report is simply redundant. Dev only.
 */
export class EagerResizeObserver {
  private inner: ResizeObserver;
  constructor(private callback: ResizeObserverCallback) {
    this.inner = new ResizeObserver(callback);
  }
  observe(target: Element, options?: ResizeObserverOptions) {
    this.inner.observe(target, options);
    const rect = target.getBoundingClientRect();
    const entry = { target, contentRect: rect } as unknown as ResizeObserverEntry;
    setTimeout(() => this.callback([entry], this as unknown as ResizeObserver), 0);
  }
  unobserve(target: Element) {
    this.inner.unobserve(target);
  }
  disconnect() {
    this.inner.disconnect();
  }
}

export default function DevCapture() {
  const get = useThree((s) => s.get);

  useEffect(() => {
    const step = (n: number) => {
      const s = get();
      const t0 = performance.now();
      for (let i = 0; i < n; i++) s.advance(t0 + i * 16, true);
    };

    const api = {
      async capture(opts: CaptureOptions) {
        const s = get();
        const cam = s.camera as THREE.PerspectiveCamera;
        const controls = s.controls as unknown as OrbitControlsImpl | null;
        const w = opts.width ?? 1600;
        const h = opts.height ?? 900;

        if (opts.mode) {
          const pose = poseFor(opts.mode, contact, opts.room ?? true, w / h);
          opts = { ...opts, position: pose.position, target: pose.target };
        }
        if (opts.position && controls) {
          cam.position.set(...opts.position);
          controls.target.set(...(opts.target ?? [0, 0, 0]));
          controls.update();
        }
        s.gl.setPixelRatio(1);
        s.gl.setSize(w, h, false);
        cam.aspect = w / h;
        cam.updateProjectionMatrix();

        step(opts.frames ?? 8);
        if (opts.waitMs) {
          await sleep(opts.waitMs);
          step(opts.frames ?? 8);
        }
        s.gl.render(s.scene, cam);
        const url = s.gl.domElement.toDataURL("image/jpeg", opts.quality ?? 0.9);
        const endpoint = opts.endpoint ?? "http://127.0.0.1:8765/save";
        const res = await fetch(`${endpoint}?name=${encodeURIComponent(opts.name)}`, {
          method: "POST",
          body: url,
        });
        return res.json();
      },
      /** Current camera pose, for building presets. */
      pose() {
        const s = get();
        const controls = s.controls as unknown as OrbitControlsImpl | null;
        return {
          position: s.camera.position.toArray().map((v) => Math.round(v)),
          target: controls?.target.toArray().map((v) => Math.round(v)),
        };
      },
      /** The live R3F state, for inspecting lights and materials. */
      state() {
        return get();
      },
      info() {
        const s = get();
        return { ...s.gl.info.render, ...s.gl.info.memory, programs: s.gl.info.programs?.length };
      },
    };

    const w = window as unknown as Record<string, unknown>;
    w.__vinylize = api;
    w.__vinylizeStore = useStore;
    return () => {
      delete w.__vinylize;
      delete w.__vinylizeStore;
    };
  }, [get]);

  return null;
}
