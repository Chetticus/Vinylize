/**
 * The room's material kit: every procedural texture and shared material,
 * built lazily on first use and cached for the life of the canvas.
 *
 * Nothing is regenerated per frame or per render. Heavy textures are painted
 * once in Web Workers (pixels.ts via paintPool.ts), light ones on the main
 * thread (textures.ts); materials are shared between every mesh that uses
 * them, and `disposeKit()` releases GPU resources when the canvas unmounts
 * while keeping the painted pixels, so returning to the tab never repaints.
 */

import * as THREE from "three";

import type { Quality } from "./quality";
import * as pixels from "./pixels";
import {
  paintBlob,
  paintBokeh,
  paintNotebook,
  paintPlot,
  paintRooftops,
  paintSky,
  paintSleeve,
  wrap,
  type Painted,
} from "./textures";
import { paintInWorkers, type PainterName } from "./paintPool";

type Std = THREE.MeshStandardMaterial;

let quality: Quality = "high";
const textures = new Map<string, Painted>();
const materials = new Map<string, THREE.Material>();

/** Texture size for the current tier. */
const px = (n: number) => (quality === "high" ? n : Math.max(128, n >> 1));

export function setKitQuality(q: Quality) {
  quality = q;
}

/**
 * While `collecting`, getters only record which worker jobs they need:
 * texture lookups return a 1×1 placeholder and nothing is cached. That lets
 * prepareKit learn the full job list from the same getters the scene uses,
 * then paint everything off the main thread before anything is built.
 */
let collecting = false;
const pending = new Map<string, [PainterName, unknown[]]>();
let placeholder: Painted | null = null;
const stub = (): Painted => {
  if (!placeholder) {
    const t = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1);
    placeholder = {
      map: t as unknown as THREE.CanvasTexture,
      normal: t as unknown as THREE.CanvasTexture,
      orm: t as unknown as THREE.CanvasTexture,
    };
  }
  return placeholder;
};

function tex(key: string, make: () => Painted): Painted {
  let t = textures.get(key);
  if (t) return t;
  if (collecting) return stub();
  t = make();
  textures.set(key, t);
  return t;
}

/** A texture from a pure pixel painter (pixels.ts). Normally painted in a
 * worker by prepareKit; painted synchronously only as a fallback. */
function ptex(key: string, job: () => [PainterName, unknown[]]): Painted {
  let t = textures.get(key);
  if (t) return t;
  if (collecting) {
    pending.set(key, job());
    return stub();
  }
  const [name, args] = job();
  t = wrap((pixels[name] as (...a: unknown[]) => pixels.PixelSet)(...args));
  textures.set(key, t);
  return t;
}

function mat<T extends THREE.Material>(key: string, make: () => T): T {
  let m = materials.get(key) as T | undefined;
  if (m) return m;
  m = make();
  if (collecting) {
    m.dispose();
    return m;
  }
  materials.set(key, m);
  return m;
}

/** A standard material fed by a painted set: colour, normal, packed ORM. */
function pbr(p: Painted, params: THREE.MeshStandardMaterialParameters = {}, metal = false): Std {
  return new THREE.MeshStandardMaterial({
    map: p.map,
    normalMap: p.normal ?? null,
    roughnessMap: p.orm ?? null,
    aoMap: p.orm ?? null,
    aoMapIntensity: 0.8,
    metalnessMap: metal && p.orm ? p.orm : null,
    roughness: 1,
    metalness: metal ? 1 : 0,
    ...params,
  });
}

// --- woods -----------------------------------------------------------------

export const walnut = () =>
  mat("walnut", () =>
    pbr(
      ptex("walnut", () => [
        "paintWood",
        [
          {
            seed: 11,
            w: px(1024),
            h: px(256),
            light: "#7a5236",
            dark: "#2e1b10",
            rings: 16,
            figure: 1.7,
            rough: [0.42, 0.7],
          },
        ],
      ]),
      { normalScale: new THREE.Vector2(0.6, 0.6) },
    ),
  );

/** Walnut board mapping: one repeat covers 900 × 225 mm. */
export const WALNUT_TEX: [number, number] = [900, 225];

/** The console top: one unique, unrepeated board with the owner's wear. */
export const consoleTop = () =>
  mat("consoleTop", () =>
    pbr(
      ptex("consoleTop", () => [
        "paintWood",
        [
          {
            seed: 29,
            w: px(2048),
            h: px(640),
            light: "#80573a",
            dark: "#2c190e",
            rings: 26,
            figure: 3.2,
            rough: [0.34, 0.62],
            relief: 1.6,
            // Listener's edge is v = 1 (front); canvas row 0 maps to v = 1.
            wear: { edgeV: 0.0, ring: [0.215, 0.24, 0.022], scratches: 7 },
          },
        ],
      ]),
      { normalScale: new THREE.Vector2(0.5, 0.5) },
    ),
  );

export const oak = () =>
  mat("oak", () =>
    pbr(
      ptex("oak", () => [
        "paintWood",
        [
          {
            seed: 41,
            w: px(1024),
            h: px(256),
            light: "#9a7550",
            dark: "#4e3521",
            rings: 17,
            figure: 1.4,
            rough: [0.5, 0.78],
          },
        ],
      ]),
    ),
  );

export const pine = () =>
  mat("pine", () =>
    pbr(
      ptex("pine", () => [
        "paintWood",
        [
          {
            seed: 53,
            w: px(512),
            h: px(128),
            light: "#b8946a",
            dark: "#76583a",
            rings: 5,
            figure: 1.5,
            rough: [0.68, 0.9],
          },
        ],
      ]),
    ),
  );

export const floor = () =>
  mat("floor", () => {
    const p = ptex("floor", () => ["paintFloor", [61, px(1024), px(1024), 8]]);
    return pbr(p, { normalScale: new THREE.Vector2(0.8, 0.8) });
  });
/** One floor texture repeat in mm (8 boards × 190 mm). */
export const FLOOR_TEX: [number, number] = [2200, 1520];

// --- walls & trim ----------------------------------------------------------

export const plaster = () =>
  mat("plaster", () =>
    pbr(
      ptex("plaster", () => ["paintPlaster", [71, "#a39179", px(1024)]]),
      {
        normalScale: new THREE.Vector2(0.22, 0.22),
      },
    ),
  );
export const PLASTER_TEX: [number, number] = [1400, 1400];

export const trim = () =>
  mat("trim", () =>
    pbr(
      ptex("plasterTrim", () => ["paintPlaster", [73, "#d2c6ae", px(256)]]),
      {
        roughness: 0.55,
        normalScale: new THREE.Vector2(0.25, 0.25),
      },
    ),
  );

/** The one accent: a deep, slightly chalky green on the window joinery. */
export const windowPaint = () =>
  mat("windowPaint", () =>
    pbr(
      ptex("plasterGreen", () => ["paintPlaster", [79, "#34443a", px(256)]]),
      {
        normalScale: new THREE.Vector2(0.3, 0.3),
      },
    ),
  );

// --- textiles & leather ------------------------------------------------------

export const leather = () =>
  mat("leather", () =>
    pbr(
      ptex("leather", () => ["paintLeather", [83, px(1024)]]),
      { normalScale: new THREE.Vector2(0.35, 0.35) },
    ),
  );

export const throwWool = () =>
  mat("throw", () => {
    const p = ptex("throw", () => ["paintThrow", [89, px(512)]]);
    for (const t of [p.map, p.normal!]) t.repeat.set(1.6, 3.2);
    return new THREE.MeshStandardMaterial({
      map: p.map,
      normalMap: p.normal,
      roughness: 0.97,
      side: THREE.DoubleSide,
    });
  });

export const rug = () => mat("rug", () => pbr(ptex("rug", () => ["paintRug", [97, px(1024), px(700)]])));

export const grille = () =>
  mat("grille", () =>
    pbr(
      ptex("grille", () => ["paintWeave", [101, px(256), "#3a342c", 2, 0.92, 0.18]]),
      {
        normalScale: new THREE.Vector2(0.8, 0.8),
      },
    ),
  );

export const linen = () =>
  mat("linen", () => {
    const p = ptex("linen", () => ["paintWeave", [103, px(256), "#e0d2b4", 2, 0.95, 0.2]]);
    // The shade's lathe UVs span its whole circumference; tile the weave.
    for (const t of [p.map, p.normal!]) t.repeat.set(9, 3);
    return new THREE.MeshStandardMaterial({
      map: p.map,
      normalMap: p.normal,
      roughness: 0.95,
      side: THREE.DoubleSide,
      // The shade glows from the bulb inside it.
      emissive: new THREE.Color("#ffb86b"),
      emissiveMap: p.map,
      emissiveIntensity: 0.55,
    });
  });

export const velvet = () =>
  mat("velvet", () => pbr(ptex("velvet", () => ["paintWeave", [109, px(128), "#5e1f1c", 2, 0.98, 0.1]])));

export const corduroy = () =>
  mat("corduroy", () =>
    pbr(ptex("corduroy", () => ["paintWeave", [107, px(256), "#5b4a3b", 4, 0.93, 0.08]])),
  );

// --- metals ------------------------------------------------------------------

export const brushedAlu = () =>
  mat("brushedAlu", () =>
    pbr(
      ptex("alu", () => ["paintBrushed", [109, px(512), "#bdb8ae"]]),
      {},
      true,
    ),
  );

export const brushedDark = () =>
  mat("brushedDark", () =>
    pbr(
      ptex("aluDark", () => ["paintBrushed", [113, px(512), "#4a4843"]]),
      { envMapIntensity: 0.8 },
      true,
    ),
  );

export const brass = () =>
  mat("brass", () =>
    pbr(
      ptex("brass", () => ["paintBrushed", [127, px(256), "#b58f4e"]]),
      { envMapIntensity: 1.1 },
      true,
    ),
  );

/** The turntable's deck plate: satin-painted metal with a faint brushed
 * tooth under the paint, darker and calmer than bare aluminium so the
 * record and arm read against it. */
export const deckPlate = () =>
  mat("deckPlate", () => {
    const p = ptex("aluDark", () => ["paintBrushed", [113, px(512), "#4a4843"]]);
    return new THREE.MeshStandardMaterial({
      color: "#3a3835",
      map: p.map,
      roughness: 0.42,
      metalness: 0.55,
      normalMap: p.normal,
      normalScale: new THREE.Vector2(0.15, 0.15),
      envMapIntensity: 0.9,
    });
  });

export const blackSatin = () =>
  mat(
    "blackSatin",
    () => new THREE.MeshStandardMaterial({ color: "#1b1a19", roughness: 0.48, metalness: 0.2 }),
  );

export const rubber = () =>
  mat("rubber", () => new THREE.MeshStandardMaterial({ color: "#141313", roughness: 0.85 }));

export const cableMat = () =>
  mat("cable", () => new THREE.MeshStandardMaterial({ color: "#1a1817", roughness: 0.55 }));

// --- ceramics, paper -------------------------------------------------------

export const cupGlaze = () =>
  mat("cupGlaze", () => pbr(ptex("cup", () => ["paintCeramic", [131, px(512), "#ddd3c1", "#5a4636"]])));

export const potGlaze = () =>
  mat("potGlaze", () => pbr(ptex("pot", () => ["paintCeramic", [137, px(512), "#6d6f5e", "#2a2520"]])));

export const coffee = () =>
  mat("coffee", () => new THREE.MeshPhysicalMaterial({ color: "#2a150b", roughness: 0.12, clearcoat: 1 }));

/** Card stock tinted per instance (book cloth, sleeve spines). */
export const card = () =>
  mat("card", () => {
    const p = ptex("card", () => ["paintCard", [139, px(256), px(64)]]);
    return new THREE.MeshStandardMaterial({ map: p.map, roughness: 0.82 });
  });

export const sleeve = (i: number) =>
  mat(`sleeve${i}`, () => {
    const p = tex(`sleeve${i}`, () => paintSleeve(149 + i, px(512)));
    return new THREE.MeshStandardMaterial({ map: p.map, roughness: 0.78 });
  });

export const notebook = () =>
  mat("notebook", () => {
    const p = tex("notebook", () => paintNotebook(151, px(1024), px(512)));
    return new THREE.MeshStandardMaterial({ map: p.map, roughness: 0.9, side: THREE.DoubleSide });
  });

export const paper = () =>
  mat("paper", () => new THREE.MeshStandardMaterial({ color: "#b9ab8e", roughness: 0.9 }));

export const leafMat = () =>
  mat(
    "leaf",
    () =>
      new THREE.MeshStandardMaterial({
        color: "#ffffff",
        roughness: 0.62,
        side: THREE.DoubleSide,
      }),
  );

// --- window ------------------------------------------------------------------

export const rainGlass = () =>
  mat("rainGlass", () => {
    const p = ptex("rain", () => ["paintRain", [157, px(1024)]]);
    return new THREE.MeshStandardMaterial({
      map: p.map,
      normalMap: p.normal,
      roughnessMap: p.orm,
      roughness: 1,
      metalness: 0,
      transparent: true,
      depthWrite: false,
      envMapIntensity: 1.6,
      normalScale: new THREE.Vector2(0.7, 0.7),
    });
  });

export const skyMat = () =>
  mat("sky", () => {
    const t = tex("sky", () => ({ map: paintSky(512, px(512)) })).map;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return new THREE.MeshBasicMaterial({ map: t, fog: false, toneMapped: true });
  });

export const rooftopsMat = () =>
  mat("rooftops", () => {
    const t = tex("rooftops", () => ({ map: paintRooftops(163, 2048, 340) })).map;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return new THREE.MeshBasicMaterial({ map: t, transparent: true, fog: false, depthWrite: false });
  });

export const bokehMat = () =>
  mat("bokeh", () => {
    const t = tex("bokeh", () => ({ map: paintBokeh(167, px(1024), px(512)) })).map;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return new THREE.MeshBasicMaterial({
      map: t,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
  });

/** Soft contact shadow decal (multiplied over whatever it lies on). */
export const blobMat = (strength: number) =>
  mat(`blob${strength}`, () => {
    const t = tex("blob", () => ({ map: paintBlob(128) })).map;
    return new THREE.MeshBasicMaterial({
      color: "#000000",
      alphaMap: t,
      transparent: true,
      opacity: strength,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      toneMapped: false,
    });
  });

export const plotPrint = () =>
  mat("plot", () => {
    const t = tex("plot", () => ({ map: paintPlot(px(512), px(640)) })).map;
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 });
  });

export const picGlass = () =>
  mat(
    "picGlass",
    () =>
      new THREE.MeshStandardMaterial({
        color: "#ffffff",
        roughness: 0.05,
        metalness: 0,
        transparent: true,
        opacity: 0.08,
        depthWrite: false,
        envMapIntensity: 2,
      }),
  );

export const platterMachined = () =>
  mat("platter", () =>
    pbr(
      ptex("lathe", () => ["paintLathe", [171, px(512)]]),
      { envMapIntensity: 1 },
      true,
    ),
  );

/**
 * Every material the room and deck use, in roughly descending paint cost.
 * `prepareKit` walks this list one entry at a time, yielding to the browser
 * between entries, so a loading screen keeps animating while the textures
 * are painted instead of the whole tab freezing on first render.
 */
const PREWARM: Array<() => unknown> = [
  consoleTop,
  floor,
  plaster,
  leather,
  rug,
  walnut,
  oak,
  rainGlass,
  notebook,
  brushedAlu,
  brushedDark,
  deckPlate,
  throwWool,
  rooftopsMat,
  bokehMat,
  skyMat,
  plotPrint,
  pine,
  cupGlaze,
  potGlaze,
  brass,
  linen,
  grille,
  corduroy,
  velvet,
  trim,
  windowPaint,
  card,
  ...[0, 1, 3, 4].map((i) => () => sleeve(i)),
  () => blobMat(0.5),
  platterMachined,
  blackSatin,
  rubber,
  cableMat,
  coffee,
  paper,
  leafMat,
  picGlass,
];

let prepared: Promise<void> | null = null;
const yieldToBrowser = () => new Promise((r) => setTimeout(r, 0));

/**
 * Paint and build the whole kit ahead of the scene, reporting progress in
 * 0..1. The heavy pixel painting runs in Web Workers (in parallel); the main
 * thread only wraps finished buffers and builds materials, one small step at
 * a time. Resolves immediately once the kit has been prepared.
 */
export function prepareKit(q: Quality, onProgress?: (frac: number) => void): Promise<void> {
  if (prepared) {
    onProgress?.(1);
    return prepared;
  }
  quality = q;
  prepared = (async () => {
    // 1. Learn which worker jobs the scene's materials need.
    collecting = true;
    pending.clear();
    try {
      for (const get of PREWARM) get();
    } finally {
      collecting = false;
    }
    const jobs = [...pending.entries()];
    const total = jobs.length + PREWARM.length;
    let done = 0;
    const tick = () => onProgress?.(++done / total);

    // 2. Paint them off the main thread; wrap each as it arrives.
    await Promise.all(
      paintInWorkers(jobs.map(([, job]) => job)).map(async (result, i) => {
        const set = await result;
        textures.set(jobs[i][0], wrap(set));
        tick();
        await yieldToBrowser();
      }),
    );

    // 3. Build the materials (and the cheap canvas-2D textures) in steps.
    for (const get of PREWARM) {
      get();
      tick();
      await yieldToBrowser();
    }
  })();
  return prepared;
}

/**
 * Release the kit's GPU resources when the canvas goes away. The painted
 * canvases and material objects are kept, so returning to the 3D tab
 * re-uploads them instead of repainting (three re-creates a disposed
 * texture's or material's GPU side on next use).
 */
export function disposeKit() {
  for (const m of materials.values()) m.dispose();
  for (const t of textures.values()) {
    t.map.dispose();
    t.normal?.dispose();
    t.orm?.dispose();
  }
}
