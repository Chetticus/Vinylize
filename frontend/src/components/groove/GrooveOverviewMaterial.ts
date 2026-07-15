/**
 * Procedural groove material for the record surface (LOD 0-1).
 *
 * Renders the clip's REAL groove structure — start radius, per-clip turn
 * count, true ~0.25 mm pitch — as an analytically anti-aliased ring pattern
 * computed per-fragment from the record-local radius. Because it is
 * resolution-independent:
 *
 *   - at turntable distance the ~100 turns of a 3-minute clip merge into a
 *     satin "recorded band" (never moiré: when the rings become sub-pixel,
 *     `fwidth` drives a blend to their area-average darkening);
 *   - as the camera closes in, individual adjacent turns resolve at their
 *     honest spacing — no geometry, no texture memory, no LOD pop.
 *
 * A 256-bin loudness texture (per-turn RMS of the user's own audio) darkens
 * louder turns — the real-world "you can see the loud track" banding — and
 * feeds a slightly stronger specular response inside the grooves, which is
 * what makes the band catch the pendant light while the disc spins.
 *
 * Lighting is a compact Blinn-Phong with a circumferential anisotropic
 * streak (vinyl's signature light bar), fed by two light-direction uniforms
 * supplied per environment. Radius is measured in RECORD-LOCAL space so the
 * pattern rotates with the disc; lighting is computed in world space.
 */

import * as THREE from "three";

import type { GrooveGeometry } from "../../types/api";

const VERT = /* glsl */ `
  varying vec3 vLocal;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  void main() {
    vLocal = position;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const FRAG = /* glsl */ `
  uniform float uRStart;      // groove band outer radius (mm, record-local)
  uniform float uREnd;        // groove band inner radius (mm)
  uniform float uPitch;       // true groove pitch (mm)
  uniform float uTurns;       // total turn count (for loudness lookup)
  uniform sampler2D uLoudness;
  uniform vec3 uBase;
  uniform vec3 uKeyDir;
  uniform vec3 uKeyColor;
  uniform vec3 uFillDir;
  uniform vec3 uFillColor;
  uniform float uAmbient;
  varying vec3 vLocal;
  varying vec3 vWorld;
  varying vec3 vNormalW;

  void main() {
    float r = length(vLocal.xz);

    // Recorded band mask with soft edges (plus a faint lead-in/out fade).
    float inBand = smoothstep(uREnd - 0.4, uREnd + 0.1, r)
                 * (1.0 - smoothstep(uRStart - 0.1, uRStart + 0.4, r));

    // Ring pattern at true pitch, analytically anti-aliased.
    float phase = (uRStart - r) / uPitch;      // 0..uTurns across the band
    float aa = fwidth(phase);
    float f = fract(phase);
    float d = min(f, 1.0 - f) * 2.0;           // 0 at groove center
    float duty = 0.5;                          // groove+shoulder shading width
    float line = 1.0 - smoothstep(duty - 2.0 * aa, duty + 2.0 * aa, d);
    // Sub-pixel rings: cross-fade to their area average (kills moiré).
    float resolve = 1.0 - smoothstep(0.35, 0.9, aa);
    float groove = mix(duty * 0.5, line, resolve);

    float loud = texture2D(uLoudness, vec2(clamp(phase / max(uTurns, 1.0), 0.0, 1.0), 0.5)).r;
    float dark = inBand * groove * mix(0.4, 0.95, loud);

    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 base = uBase * (1.0 - 0.55 * dark);

    vec3 col = base * uAmbient;
    // Key light: diffuse + sharp specular + circumferential anisotropic streak.
    {
      vec3 Ld = normalize(uKeyDir);
      vec3 H = normalize(Ld + V);
      float diff = max(dot(N, Ld), 0.0);
      float spec = pow(max(dot(N, H), 0.0), 90.0);
      vec3 T = normalize(vec3(-vLocal.z, 0.0, vLocal.x)); // groove tangent
      float streak = pow(max(1.0 - abs(dot(H, T)), 0.0), 10.0) * max(dot(N, Ld), 0.0);
      col += uKeyColor * (diff * 0.8 * base + (0.15 + 0.55 * dark) * spec + 0.10 * streak * inBand);
    }
    // Fill light: diffuse only.
    {
      vec3 Ld = normalize(uFillDir);
      col += uFillColor * max(dot(N, Ld), 0.0) * 0.3 * base;
    }

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export interface OverviewLightRig {
  keyDir: THREE.Vector3;
  keyColor: THREE.Color;
  fillDir: THREE.Vector3;
  fillColor: THREE.Color;
  ambient: number;
}

/** Per-turn RMS of the uploaded audio -> 256-bin loudness texture. */
export function buildLoudnessTexture(geometry: GrooveGeometry): THREE.DataTexture {
  const bins = 256;
  const sum = new Float32Array(bins);
  const count = new Float32Array(bins);
  const turns = Math.max(geometry.meta.revolutions, 1e-3);
  const twoPi = 2 * Math.PI;
  for (let i = 0; i < geometry.theta.length; i++) {
    const b = Math.min(bins - 1, Math.floor((geometry.theta[i] / (turns * twoPi)) * bins));
    const v = geometry.lateral[i];
    sum[b] += v * v;
    count[b] += 1;
  }
  let peak = 1e-12;
  const rms = new Float32Array(bins);
  for (let b = 0; b < bins; b++) {
    rms[b] = count[b] > 0 ? Math.sqrt(sum[b] / count[b]) : 0;
    peak = Math.max(peak, rms[b]);
  }
  const data = new Uint8Array(bins * 4);
  for (let b = 0; b < bins; b++) {
    const v = Math.round(255 * Math.sqrt(rms[b] / peak)); // sqrt: perceptual-ish
    data[b * 4] = data[b * 4 + 1] = data[b * 4 + 2] = v;
    data[b * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, bins, 1);
  tex.needsUpdate = true;
  return tex;
}

export function makeGrooveOverviewMaterial(
  geometry: GrooveGeometry,
  loudness: THREE.DataTexture,
  rig: OverviewLightRig,
): THREE.ShaderMaterial {
  const meta = geometry.meta;
  const pitchMm = meta.groove_pitch_um / 1000;
  const rStart = meta.start_radius_mm;
  const rEnd = rStart - meta.revolutions * pitchMm;
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uRStart: { value: rStart },
      uREnd: { value: rEnd },
      uPitch: { value: pitchMm },
      uTurns: { value: meta.revolutions },
      uLoudness: { value: loudness },
      uBase: { value: new THREE.Color("#141416") },
      uKeyDir: { value: rig.keyDir },
      uKeyColor: { value: rig.keyColor },
      uFillDir: { value: rig.fillDir },
      uFillColor: { value: rig.fillColor },
      uAmbient: { value: rig.ambient },
    },
  });
}
