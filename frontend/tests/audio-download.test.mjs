import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const compiled = ts.transpileModule(
  readFileSync(new URL("../src/api/client.ts", import.meta.url), "utf8"),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } },
).outputText;

function setup() {
  const exports = {};
  runInNewContext(compiled, {
    exports, Uint8Array, AbortController,
    window: { setTimeout, clearTimeout },
    fetch: async () => new Response(new Uint8Array([1, 2, 3, 4]), {
      headers: { "content-length": "4" },
    }),
  });
  const source = [new Float32Array([0.1, 0.2, 0.3, 0.4]), new Float32Array([-0.1, -0.2, -0.3, -0.4])];
  const decoded = { sampleRate: 2, duration: 2, numberOfChannels: 2,
    getChannelData: (channel) => source[channel] };
  const ctx = {
    decodeAudioData: async (raw) => { assert.equal(raw.byteLength, 4); return decoded; },
    createBuffer: (channels, frames, rate) => {
      const data = Array.from({ length: channels }, () => new Float32Array(frames));
      return { sampleRate: rate, length: frames, getChannelData: (channel) => data[channel] };
    },
  };
  return { fetchAudioBuffer: exports.fetchAudioBuffer, ctx, decoded, source };
}

test("compact source download reports bytes and adds only aligned silence", async () => {
  const { fetchAudioBuffer, ctx, source } = setup();
  const progress = [];
  const result = await fetchAudioBuffer("/source.mp3", ctx, (a, b) => progress.push([a, b]), 1, 1);
  assert.equal(result.length, 4);
  assert.deepEqual([...result.getChannelData(0)], [0, 0, ...source[0].slice(0, 2)]);
  assert.deepEqual([...result.getChannelData(1)], [0, 0, ...source[1].slice(0, 2)]);
  assert.deepEqual(progress.at(-1), [4, 4]);
});

test("already padded WAV and lossless Vinyl buffers pass through unchanged", async () => {
  const { fetchAudioBuffer, ctx, decoded } = setup();
  assert.equal(await fetchAudioBuffer("/vinyl.flac", ctx), decoded);
});
