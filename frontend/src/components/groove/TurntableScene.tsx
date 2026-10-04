/**
 * The listening room. Static furniture is batched once; only the camera,
 * platter, record swap and tonearm animate. Demand rendering sleeps when
 * paused, hidden, or reading the story.
 */
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

import type { GrooveGeometry } from "../../types/api";
import { engine, useStore } from "../../state/store";
import DevCapture, { EagerResizeObserver } from "./DevCapture";
import RecordSurface from "./RecordSurface";
import Tonearm from "./Tonearm";
import { makeLabelTexture } from "./labelTexture";
import { clipTime, discAngle } from "./recordMotion";
import { poseFor } from "./grooveLod";
import ListeningRoom from "./room/ListeningRoom";
import { projectUV } from "./room/geom";
import * as kit from "./room/kit";
import { CAMERA_BOUNDS } from "./room/layout";
import { adjustResolution, detectQuality, resolutionFor, type Quality } from "./room/quality";

interface Props {
  geometry: GrooveGeometry;
  filename: string;
  sessionId: string;
  active: boolean;
  onScrub: (t: number) => void;
  cueEnabled: boolean;
  onCueStart: () => void;
  onCueMove: (t: number) => void;
  onCueEnd: () => void;
  onReady?: () => void;
}

function SpinningRecord({ children }: { children: React.ReactNode }) {
  const rot = useRef<THREE.Group>(null);
  useFrame(() => {
    if (rot.current) rot.current.rotation.y = discAngle(clipTime());
  });
  return <group ref={rot}>{children}</group>;
}

function Record({
  geometry, filename, onScrub, onPrepared,
}: {
  geometry: GrooveGeometry;
  filename: string;
  onScrub: (t: number) => void;
  onPrepared: () => void;
}) {
  const group = useRef<THREE.Group>(null);
  const gl = useThree((s) => s.gl);
  const labelTex = useMemo(() => makeLabelTexture(filename), [filename]);
  useEffect(() => () => labelTex.dispose(), [labelTex]);
  useLayoutEffect(() => {
    gl.initTexture(labelTex);
    // All record materials share the shaders warmed with the first pressing.
    // Upload maps before revealing a swap, without racing a second compiler
    // against the full room's asynchronous warm-up.
    onPrepared();
  }, [gl, labelTex, geometry, onPrepared]);

  return (
    <group ref={group}>
      <SpinningRecord>
        {/* Open sides avoid a duplicate top face underneath the groove map.
            The old 0.04 mm gap caused z-fighting as the record landed. */}
        <mesh castShadow position={[0, -2.4, 0]}>
          <cylinderGeometry args={[152, 152, 4, 96, 1, true]} />
          <meshStandardMaterial color="#0d0d10" roughness={0.34} metalness={0.05} />
        </mesh>
        <mesh position={[0, -0.36, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[152, 96]} />
          <meshStandardMaterial color="#0d0d10" roughness={0.34} />
        </mesh>
        <RecordSurface geometry={geometry} onScrub={onScrub} receiveShadow={false} />
        <mesh position={[0, 0.2, 0]}>
          <cylinderGeometry args={[50, 50, 1.2, 48]} />
          <meshStandardMaterial color="#181318" roughness={0.72} />
        </mesh>
        <mesh position={[0, 1.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[49.5, 48]} />
          <meshStandardMaterial map={labelTex} roughness={0.75} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
        </mesh>
      </SpinningRecord>
    </group>
  );
}

interface RecordData {
  geometry: GrooveGeometry;
  filename: string;
  sessionId: string;
}

function RecordChanger({
  target, onScrub, cueEnabled, onCueStart, onCueMove, onCueEnd,
}: {
  target: RecordData;
  onScrub: (t: number) => void;
  cueEnabled: boolean;
  onCueStart: () => void;
  onCueMove: (t: number) => void;
  onCueEnd: () => void;
}) {
  const carrier = useRef<THREE.Group>(null);
  const [shown, setShown] = useState(target);
  const [swapping, setSwapping] = useState(false);
  const pending = useRef(target);
  const phase = useRef<"idle" | "out" | "waiting" | "in">("idle");
  const elapsed = useRef(0);
  const arrival = useRef({ x: 420, z: 45, tiltX: 0.1, tiltZ: -0.22 });
  const invalidate = useThree((s) => s.invalidate);
  const scene = useThree((s) => s.scene);

  useEffect(() => {
    pending.current = target;
    if (target.sessionId === shown.sessionId) {
      if (phase.current === "idle" && target !== shown) setShown(target);
      return;
    }
    if (phase.current === "idle") {
      elapsed.current = 0;
      phase.current = "out";
      setSwapping(true);
      invalidate();
    }
  }, [target, shown, invalidate]);

  const prepared = useCallback(() => {
    const group = carrier.current;
    if (phase.current === "waiting" && group) {
      arrival.current = { x: 420, z: 45, tiltX: 0.1, tiltZ: -0.22 };
      group.position.set(420, 105, 45);
      group.rotation.set(0.1, 0, -0.22);
      group.visible = true;
      elapsed.current = 0;
      phase.current = "in";
    }
    invalidate();
  }, [invalidate]);

  useFrame((_, delta) => {
    const group = carrier.current;
    if (!group || phase.current === "idle" || phase.current === "waiting") return;
    invalidate();
    elapsed.current += Math.min(delta, 0.05);
    if (phase.current === "out") {
      const p = Math.min(1, elapsed.current / 0.72);
      const eased = p * p * (3 - 2 * p);
      group.position.set(-420 * eased, 105 * Math.sin(p * Math.PI * 0.58), -45 * eased);
      group.rotation.set(-0.1 * eased, 0, 0.22 * eased);
      if (p >= 1) {
        // A quick change back to the currently shown disc needs no remount.
        // Waiting for its mount callback would leave the carrier hidden forever.
        if (pending.current.sessionId === shown.sessionId) {
          arrival.current = { x: -420, z: -45, tiltX: -0.1, tiltZ: 0.22 };
          elapsed.current = 0;
          phase.current = "in";
        } else {
          // Upload the replacement maps before revealing the incoming disc.
          group.visible = false;
          phase.current = "waiting";
          setShown(pending.current);
        }
      }
      return;
    }
    const p = Math.min(1, elapsed.current / 0.88);
    const eased = p * p * (3 - 2 * p);
    const remaining = 1 - eased;
    const from = arrival.current;
    group.position.set(from.x * remaining, 105 * Math.sin((1 - p) * Math.PI * 0.58), from.z * remaining);
    group.rotation.set(from.tiltX * remaining, 0, from.tiltZ * remaining);
    if (p >= 1) {
      group.position.set(0, 0, 0);
      group.rotation.set(0, 0, 0);
      scene.userData.shadowRevision = (scene.userData.shadowRevision ?? 0) + 1;
      if (pending.current.sessionId !== shown.sessionId) {
        elapsed.current = 0;
        phase.current = "out";
      } else {
        phase.current = "idle";
        setSwapping(false);
      }
    }
  });

  return (
    <>
      <group ref={carrier}>
        <Record key={shown.sessionId} geometry={shown.geometry}
          filename={shown.filename} onScrub={cueEnabled && !swapping ? onScrub : () => {}}
          onPrepared={prepared} />
      </group>
      <Tonearm geometry={shown.geometry} view="both"
        cueEnabled={cueEnabled && !swapping} raised={swapping}
        onCueStart={onCueStart} onCueMove={onCueMove} onCueEnd={onCueEnd} />
    </>
  );
}

/** Rotation-only spin group (no wobble) — the platter turns dead-centered. */
function SpinningPlatter({ children }: { children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    if (ref.current) ref.current.rotation.y = discAngle(clipTime());
  });
  return <group ref={ref}>{children}</group>;
}

/** Plinth, feet, platter and controls. Dimensions are unchanged from the
 * physics layout (plinth top y = -16.4, feet on y = -54.4, platter top
 * y = -4.4); only construction and materials carry the detail: a walnut
 * body under a satin metal deck plate, machined aluminium platter with a
 * rubber mat, and a start button whose surround is worn glossy by use. */
function Deck() {
  const g = useMemo(() => {
    const body = new RoundedBoxGeometry(560, 26, 420, 3, 4);
    const plate = new RoundedBoxGeometry(552, 5.4, 412, 2, 1.6);
    // Brushing at true scale: one texture repeat per ~180 mm.
    projectUV(plate, "x", [180, 180]);
    return { body, plate };
  }, []);
  useEffect(
    () => () => {
      g.body.dispose();
      g.plate.dispose();
    },
    [g],
  );
  return (
    <group>
      {/* Walnut body with a satin, faintly brushed deck plate on top: three
          distinct materials (wood / painted metal / vinyl) stack upward. */}
      <mesh geometry={g.body} material={kit.walnut()} castShadow receiveShadow position={[35, -35.4, -10]} />
      <mesh geometry={g.plate} material={kit.deckPlate()} castShadow receiveShadow position={[35, -19.1, -10]} />
      {[
        [-215, -190],
        [285, -190],
        [-215, 170],
        [285, 170],
      ].map(([x, z]) => (
        <group key={`${x},${z}`} position={[x, -50.4, z]}>
          <mesh castShadow>
            <cylinderGeometry args={[12, 14, 5, 24]} />
            <meshStandardMaterial color="#8c8a86" metalness={0.9} roughness={0.35} />
          </mesh>
          <mesh position={[0, -3, 0]}>
            <cylinderGeometry args={[13, 13, 2.2, 24]} />
            <meshStandardMaterial color="#141313" roughness={0.9} />
          </mesh>
        </group>
      ))}
      {/* Start/stop and speed buttons, front left of the plate. */}
      {[
        [-196, 168, 13, "#bdb8ae"],
        [-160, 172, 8, "#8e8a82"],
        [-136, 173, 8, "#8e8a82"],
      ].map(([x, z, r, c], i) => (
        <mesh key={i} position={[x as number, -14.9, z as number]} castShadow>
          <cylinderGeometry args={[r as number, (r as number) + 0.6, 3.2, 32]} />
          <meshStandardMaterial color={c as string} metalness={0.9} roughness={i === 0 ? 0.22 : 0.34} />
        </mesh>
      ))}
      <mesh position={[-196, -16.33, 168]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[13.5, 24, 40]} />
        {/* Handling wear: the plate around the button is rubbed smoother. */}
        <meshStandardMaterial color="#5a5852" metalness={0.8} roughness={0.2} transparent opacity={0.35} depthWrite={false} />
      </mesh>
      {/* Dust-cover hinges at the back edge. */}
      {[-150, 220].map((x) => (
        <mesh key={x} position={[x, -24, -222]} castShadow>
          <boxGeometry args={[44, 18, 10]} />
          <meshStandardMaterial color="#1c1b1a" metalness={0.4} roughness={0.45} />
        </mesh>
      ))}
      {/* Platter assembly SPINS: machined aluminium rim (the circumferential
          brushing reads as rotation), a rubber mat under the record. The
          platter and record both turn dead-centered. */}
      <SpinningPlatter>
        <mesh castShadow receiveShadow position={[0, -11.4, 0]} material={kit.brushedAlu()}>
          <cylinderGeometry args={[158, 157, 10, 128]} />
        </mesh>
        <mesh position={[0, -5.4, 0]} receiveShadow>
          <cylinderGeometry args={[149, 149, 2, 96]} />
          <meshStandardMaterial color="#1a1918" roughness={0.92} />
        </mesh>
        {/* Polished chamfer ring on the rim's top edge. */}
        <mesh position={[0, -6.6, 0]}>
          <cylinderGeometry args={[157.2, 158.4, 1.2, 128]} />
          <meshStandardMaterial color="#d8d6d0" metalness={1} roughness={0.12} envMapIntensity={1.2} />
        </mesh>
        {/* Spindle stays centered. Audio wow remains in the DSP without
            introducing subpixel wobble/shimmer in the displayed record. */}
        <mesh castShadow position={[0, 2.5, 0]}>
          <cylinderGeometry args={[3.4, 3.4, 7, 24]} />
          <meshStandardMaterial color="#9a9aa2" metalness={0.9} roughness={0.2} />
        </mesh>
      </SpinningPlatter>
    </group>
  );
}


/** Pointer position drives a bounded, eased orbit. There is no button hold
 * requirement. Touch screens retain a one-finger look gesture. */
function CameraRig({ active }: { active: boolean }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const gl = useThree((s) => s.gl);
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  const pointer = useRef({ x: 0, y: 0, zoom: 1, held: false });
  const focus = useRef(new THREE.Vector3());
  const base = useRef(new THREE.Spherical());
  const desired = useRef(new THREE.Vector3());
  const bounds = useMemo(() => ({
    min: new THREE.Vector3(...CAMERA_BOUNDS.min),
    max: new THREE.Vector3(...CAMERA_BOUNDS.max),
  }), []);

  useEffect(() => {
    const pose = poseFor("overview", { x: 0, z: 0 }, true, size.width / Math.max(size.height, 1));
    focus.current.set(...pose.target);
    base.current.setFromVector3(new THREE.Vector3(...pose.position).sub(focus.current));
    camera.position.set(...pose.position);
    camera.fov = 38;
    camera.filmOffset = 0;
    camera.lookAt(focus.current);
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, size.width, size.height, invalidate]);

  useEffect(() => {
    const el = gl.domElement;
    el.tabIndex = 0;
    el.setAttribute("aria-label", "Listening room. Move your pointer to look around; scroll to zoom.");
    const move = (e: PointerEvent) => {
      if (!active || useStore.getState().cueing || (e.pointerType === "mouse" && e.buttons)) return;
      if (e.pointerType !== "mouse" && !pointer.current.held) return;
      const r = el.getBoundingClientRect();
      pointer.current.x = THREE.MathUtils.clamp(((e.clientX - r.left) / r.width - 0.5) * 2, -1, 1);
      pointer.current.y = THREE.MathUtils.clamp(((e.clientY - r.top) / r.height - 0.5) * 2, -1, 1);
      invalidate();
    };
    const leave = () => { pointer.current.x = pointer.current.y = 0; pointer.current.held = false; invalidate(); };
    const down = () => { pointer.current.held = true; };
    const up = () => { pointer.current.held = false; };
    const wheel = (e: WheelEvent) => {
      if (!active || useStore.getState().cueing) return;
      e.preventDefault();
      pointer.current.zoom = THREE.MathUtils.clamp(pointer.current.zoom * Math.exp(e.deltaY * 0.001), 0.48, 1.55);
      invalidate();
    };
    const key = (e: KeyboardEvent) => {
      const p = pointer.current;
      if (e.key === "ArrowLeft") p.x = Math.max(-1, p.x - 0.2);
      else if (e.key === "ArrowRight") p.x = Math.min(1, p.x + 0.2);
      else if (e.key === "ArrowUp") p.y = Math.max(-1, p.y - 0.2);
      else if (e.key === "ArrowDown") p.y = Math.min(1, p.y + 0.2);
      else if (e.key === "Home") { p.x = p.y = 0; p.zoom = 1; }
      else return;
      e.preventDefault(); invalidate();
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointerup", up);
    el.addEventListener("wheel", wheel, { passive: false });
    el.addEventListener("keydown", key);
    return () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointerup", up);
      el.removeEventListener("wheel", wheel);
      el.removeEventListener("keydown", key);
    };
  }, [active, gl, invalidate]);

  useFrame((_, delta) => {
    if (!active || useStore.getState().cueing) return;
    const p = pointer.current;
    const b = base.current;
    const theta = b.theta + p.x * 0.68;
    const phi = THREE.MathUtils.clamp(b.phi + p.y * 0.20, 0.75, 1.42);
    const radius = b.radius * p.zoom;
    desired.current.set(
      radius * Math.sin(phi) * Math.sin(theta),
      radius * Math.cos(phi),
      radius * Math.sin(phi) * Math.cos(theta),
    ).add(focus.current);
    desired.current.clamp(bounds.min, bounds.max);
    if (camera.position.distanceToSquared(desired.current) < 0.04) return;
    camera.position.lerp(desired.current, 1 - Math.exp(-5 * Math.min(delta, 0.05)));
    camera.lookAt(focus.current);
    invalidate();
  });
  return null;
}

/** Keep the non-visual savings, with a sharp resolution floor. Only measure
 * continuous playback, not sparse demand frames while paused. */
function RenderBudget({ active, ready, quality, targetDpr }: {
  active: boolean; ready: boolean; quality: Quality; targetDpr: number;
}) {
  const invalidate = useThree((s) => s.invalidate);
  const setDpr = useThree((s) => s.setDpr);
  const setFrameloop = useThree((s) => s.setFrameloop);
  const gl = useThree((s) => s.gl);
  const measured = useRef({ sum: 0, n: 0 });
  const resume = useCallback(() => { if (active && !document.hidden) invalidate(); }, [active, invalidate]);
  useEffect(() => {
    const visibility = () => {
      setFrameloop(active && !document.hidden ? "demand" : "never");
      resume();
    };
    visibility();
    const unsub = useStore.subscribe((s, prev) => {
      if (s.playing !== prev.playing || s.positionS !== prev.positionS || s.cueing !== prev.cueing) resume();
    });
    document.addEventListener("visibilitychange", visibility);
    return () => { unsub(); document.removeEventListener("visibilitychange", visibility); };
  }, [active, resume, setFrameloop]);
  useFrame((_, delta) => {
    if (!active || document.hidden) return;
    if (engine.isPlaying || useStore.getState().cueing) invalidate();
    if (!ready || !engine.isPlaying || delta > 0.12 || delta < 0.001) {
      measured.current.sum = measured.current.n = 0;
      return;
    }
    const m = measured.current;
    m.sum += delta; m.n++;
    if (m.n < 240) return;
    const mean = m.sum / m.n;
    const ratio = gl.getPixelRatio();
    const next = adjustResolution(quality, ratio, targetDpr, mean);
    if (Math.abs(next - ratio) > 0.001) setDpr(next);
    m.sum = m.n = 0;
  });
  return null;
}

function WarmUp({ armed, onReady }: { armed: boolean; onReady: () => void }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    if (!armed) return;
    let alive = true;
    void gl.compileAsync(scene, camera).catch(() => undefined).then(() => {
      if (!alive) return;
      scene.userData.shadowRevision = (scene.userData.shadowRevision ?? 0) + 1;
      invalidate();
      // Reveal only after a real rendered frame, without a delayed timer
      // capable of updating an unmounted component.
      requestAnimationFrame(() => { if (alive) onReady(); });
    });
    return () => { alive = false; };
  }, [armed, gl, scene, camera, invalidate, onReady]);
  return null;
}

function KitLifetime() {
  useEffect(() => () => kit.disposeKit(), []);
  return null;
}

function TurntableScene({
  geometry, filename, sessionId, active, onScrub, cueEnabled,
  onCueStart, onCueMove, onCueEnd, onReady,
}: Props) {
  const quality = useMemo(() => { const q = detectQuality(); kit.setKitQuality(q); return q; }, []);
  const targetDpr = resolutionFor(quality, window.devicePixelRatio || 1);
  const [roomBuilt, setRoomBuilt] = useState(false);
  const [ready, setReady] = useState(false);
  const target = useMemo(() => ({ geometry, filename, sessionId }), [geometry, filename, sessionId]);
  const finish = useCallback(() => { setReady(true); onReady?.(); }, [onReady]);
  const built = useCallback(() => setRoomBuilt(true), []);

  return (
    <Canvas shadows frameloop="demand"
      camera={{ position: [820, 340, 760], fov: 38, near: 8, far: 9000 }}
      dpr={targetDpr}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      resize={import.meta.env.DEV ? { polyfill: EagerResizeObserver } : undefined}
    >
      <color attach="background" args={["#120d09"]} />
      <KitLifetime />
      <ListeningRoom quality={quality} onBuilt={built} />
      <Deck />
      <RecordChanger target={target} onScrub={onScrub} cueEnabled={cueEnabled}
        onCueStart={onCueStart} onCueMove={onCueMove} onCueEnd={onCueEnd} />
      <CameraRig active={active} />
      <WarmUp armed={roomBuilt} onReady={finish} />
      <RenderBudget active={active} ready={ready} quality={quality} targetDpr={targetDpr} />
      {import.meta.env.DEV && <DevCapture />}
    </Canvas>
  );
}
export default memo(TurntableScene);
