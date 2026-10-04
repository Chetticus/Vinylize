import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// Test the real playback implementation without starting a browser or
// requiring an audio device. The graph records scheduling and disconnection.
const compiled = ts.transpileModule(
  readFileSync(new URL("../src/audio/playbackEngine.ts", import.meta.url), "utf8"),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } },
).outputText;

class Param {
  value = 1;
  ramps = [];
  setTargetAtTime(value) { this.value = value; }
  cancelAndHoldAtTime() {}
  cancelScheduledValues() {}
  linearRampToValueAtTime(value, time) { this.ramps.push([value, time]); }
}
class Node {
  connections = [];
  disconnected = false;
  connect(node) { this.connections.push(node); }
  disconnect() { this.connections = []; this.disconnected = true; }
}
class Gain extends Node { gain = new Param(); }
class Source extends Node {
  onended = null;
  stopped = false;
  start(time, offset) { this.started = [time, offset]; }
  stop() { this.stopped = true; }
}

function setup() {
  let context;
  class Context {
    constructor() { context = this; }
    currentTime = 10;
    sampleRate = 44100;
    state = "running";
    destination = new Node();
    sources = [];
    convolvers = [];
    createGain() { return new Gain(); }
    createConvolver() {
      const node = new Node(); this.convolvers.push(node); return node;
    }
    createBuffer(channels, length, sampleRate) {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return { duration: length / sampleRate, getChannelData: (c) => data[c] };
    }
    createDynamicsCompressor() {
      const node = new Node();
      for (const key of ["threshold", "knee", "ratio", "attack", "release"]) node[key] = new Param();
      return node;
    }
    createBufferSource() {
      const node = new Source(); this.sources.push(node); return node;
    }
  }
  const exports = {};
  runInNewContext(compiled, { exports, AudioContext: Context, Float32Array });
  const engine = new exports.PlaybackEngine();
  engine.setBuffers({ duration: 180 }, { duration: 180 });
  return { engine, ctx: () => context };
}

test("Vinyl keeps its room response and original mix", () => {
  const { engine, ctx } = setup();
  assert.equal(engine.currentAcousticSpace, "room");
  engine.play();
  assert.equal(ctx().convolvers.length, 1);
  assert.equal(ctx().convolvers[0].buffer.duration, 0.9);
  const bus = ctx().sources[1].connections[0].connections[0];
  assert.equal(bus.connections[0].gain.value, 0.94);
  assert.equal(bus.connections[1].connections[0].gain.value, 0.18);
});

test("Digital bypasses convolution, vinyl processing and the output limiter", () => {
  const { engine, ctx } = setup();
  engine.setMode("original");
  engine.play();
  const sourceGain = ctx().sources[0].connections[0];
  const digitalVolume = sourceGain.connections[0];
  assert.equal(digitalVolume.gain.value, 1);
  assert.deepEqual(digitalVolume.connections, [ctx().destination]);
  assert.equal(ctx().convolvers[0].connections[0].gain.value, 0);
  engine.setVolume(0.5);
  assert.equal(digitalVolume.gain.value, 0.5);
});

test("switching to Digital fades out any lingering vinyl room tail", () => {
  const { engine, ctx } = setup();
  engine.play();
  engine.setMode("original");
  const wet = ctx().convolvers[0].connections[0].gain;
  assert.equal(wet.ramps.at(-1)[0], 0);
  assert.equal(ctx().sources[0].connections[0].gain.ramps.at(-1)[0], 1);
  engine.setMode("vinyl");
  assert.equal(wet.ramps.at(-1)[0], 0.18);
});

test("sources start sample-synchronized and the muted side starts at zero", () => {
  const { engine, ctx } = setup();
  engine.setMode("original");
  engine.play(7);
  const [original, vinyl] = ctx().sources;
  assert.deepEqual(original.started, vinyl.started);
  assert.equal(original.started[1], 7);
  assert.equal(original.connections[0].gain.value, 1);
  assert.equal(vinyl.connections[0].gain.value, 0);
});

test("scheduled headroom never exposes a negative playback position", () => {
  const { engine } = setup();
  engine.play();
  assert.equal(engine.position(), 0);
});

test("seeking disconnects old sources and gain nodes instead of leaking the graph", () => {
  const { engine, ctx } = setup();
  engine.play();
  const oldSources = [...ctx().sources];
  const oldGains = oldSources.map((source) => source.connections[0]);
  engine.seek(15);
  for (const source of oldSources) {
    assert.equal(source.stopped, true);
    assert.equal(source.disconnected, true);
    assert.equal(source.onended, null);
  }
  for (const gain of oldGains) assert.equal(gain.disconnected, true);
  assert.equal(ctx().sources[2].started[1], 15);
  engine.pause();
  assert.equal(engine.isPlaying, false);
  assert.equal(engine.position(), 15);
});

test("natural completion releases both source graphs and calls onEnded once", () => {
  const { engine, ctx } = setup();
  let ended = 0;
  engine.onEnded = () => ended++;
  engine.play();
  const sources = ctx().sources;
  sources[1].onended();
  assert.equal(ended, 1);
  assert.equal(engine.isPlaying, false);
  assert.equal(engine.position(), 0);
  for (const source of sources) assert.equal(source.disconnected, true);
});
