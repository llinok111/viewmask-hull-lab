// Timing harness: 1 cold run (fresh module state) + 5 warm repetitions.
// Writes bench/result.json with min/median/p95/stddev for each stage.
import { readFileSync, writeFileSync } from 'node:fs';
import * as C from '../src/core.mjs';

const scene = JSON.parse(readFileSync(new URL('../data/scene.json', import.meta.url), 'utf8'));
const { shape, views, grid, maskRes, worldRadius } = scene;

function runOnce() {
  const t0 = performance.now();
  const model = C.buildModel({ shape, views, n: grid, res: maskRes, worldRadius });
  const t1 = performance.now();
  const g = C.greedyViews(model, 8);
  const t2 = performance.now();
  const u4 = C.hullStats(model, C.uniformViews(4, views.length));
  const u8 = C.hullStats(model, C.uniformViews(8, views.length));
  const u16 = C.hullStats(model, C.uniformViews(16, views.length));
  const gs = C.hullStats(model, g.chosen);
  const sig = C.hullSignature(model, g.chosen);
  const t3 = performance.now();
  return {
    buildMs: t1 - t0,
    greedyMs: t2 - t1,
    statsMs: t3 - t2,
    totalMs: t3 - t0,
    metrics: { u4, u8, u16, greedy8: gs, greedyViews: g.chosen, signature: sig.hull },
  };
}

const cold = runOnce();
const samples = [];
for (let i = 0; i < 5; i++) samples.push(runOnce());

function summarise(key) {
  const xs = samples.map((s) => s[key]).sort((a, b) => a - b);
  const n = xs.length;
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const median = xs[Math.floor(n / 2)];
  const variance = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const stddev = Math.sqrt(variance);
  const p95 = xs[Math.min(n - 1, Math.ceil(0.95 * n) - 1)];
  return {
    coldMs: Number(cold[key].toFixed(3)),
    min: Number(xs[0].toFixed(3)),
    median: Number(median.toFixed(3)),
    p95: Number(p95.toFixed(3)),
    max: Number(xs[n - 1].toFixed(3)),
    stddev: Number(stddev.toFixed(3)),
    samples: n,
    relStddev: Number((stddev / median).toFixed(4)),
  };
}

const m = cold.metrics;
const result = {
  generatedAt: new Date().toISOString(),
  node: process.version,
  grid: `${grid}^3`,
  maskRes: `${maskRes}^2`,
  candidateViews: views.length,
  timings: {
    buildModel: summarise('buildMs'),
    greedy8: summarise('greedyMs'),
    stats4: summarise('statsMs'),
    total: summarise('totalMs'),
  },
  metrics: {
    gtVoxels: m.u4.gt,
    totalVoxels: m.u4.total,
    uniform4: { kept: m.u4.kept, iou: m.u4.iou, hullOnly: m.u4.hullOnly },
    uniform8: { kept: m.u8.kept, iou: m.u8.iou, hullOnly: m.u8.hullOnly },
    uniform16: { kept: m.u16.kept, iou: m.u16.iou, hullOnly: m.u16.hullOnly },
    greedy8: { kept: m.greedy8.kept, iou: m.greedy8.iou, hullOnly: m.greedy8.hullOnly, views: m.greedyViews },
    falseNegatives: m.greedy8.falseNegative,
    witnessCompleteness: `${m.greedy8.fullWitnesses}/${m.greedy8.kept}`,
    signature: m.signature,
  },
};
writeFileSync(new URL('./result.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
