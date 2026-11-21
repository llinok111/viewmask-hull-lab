// Generalisation check (not part of the headline claim): does greedy-8 stay
// ahead of uniform-8 on shapes other than the shipped sample? Grid 40³, 80²
// silhouettes, same 48 Fibonacci views. Writes bench/generalize.json.
import { writeFileSync } from 'node:fs';
import * as C from '../src/core.mjs';

const s = 1;
const shapes = {
  'sample-rotated-4box': C.defaultShape(1),
  'zigzag-3box': {
    scale: s,
    boxes: [
      { c: [-0.45 * s, 0, -0.35 * s], h: [0.35 * s, 0.22 * s, 0.18 * s], yaw: 0.6 },
      { c: [0.05 * s, 0, 0.0 * s], h: [0.18 * s, 0.22 * s, 0.55 * s], yaw: 0.6 },
      { c: [0.45 * s, 0, 0.35 * s], h: [0.35 * s, 0.22 * s, 0.18 * s], yaw: 0.6 },
    ],
  },
  'split-plate-3slab': {
    scale: s,
    boxes: [
      { c: [-0.55 * s, 0, 0], h: [0.18 * s, 0.30 * s, 0.60 * s], yaw: 0 },
      { c: [0.0 * s, 0, 0], h: [0.18 * s, 0.30 * s, 0.60 * s], yaw: 0 },
      { c: [0.55 * s, 0, 0], h: [0.18 * s, 0.30 * s, 0.60 * s], yaw: 0 },
    ],
  },
  'orthogonal-L': {
    scale: s,
    boxes: [
      { c: [-0.35 * s, 0, -0.35 * s], h: [0.55 * s, 0.25 * s, 0.18 * s], yaw: 0 },
      { c: [0.10 * s, 0, 0.05 * s], h: [0.18 * s, 0.25 * s, 0.55 * s], yaw: 0 },
      { c: [0.50 * s, 0, 0.45 * s], h: [0.30 * s, 0.25 * s, 0.18 * s], yaw: 0 },
    ],
  },
  'cross-45deg': {
    scale: s,
    boxes: [
      { c: [0, 0, 0], h: [0.62 * s, 0.20 * s, 0.16 * s], yaw: Math.PI / 4 },
      { c: [0, 0, 0], h: [0.62 * s, 0.20 * s, 0.16 * s], yaw: -Math.PI / 4 },
      { c: [0, 0, 0], h: [0.16 * s, 0.20 * s, 0.62 * s], yaw: 0 },
    ],
  },
};

const views = C.fibonacciViews(48);
const grid = 40;
const maskRes = 80;
const worldRadius = 1.62;
const rows = [];
for (const [name, shape] of Object.entries(shapes)) {
  const model = C.buildModel({ shape, views, n: grid, res: maskRes, worldRadius });
  const u4 = C.hullStats(model, C.uniformViews(4, 48));
  const u8 = C.hullStats(model, C.uniformViews(8, 48));
  const u16 = C.hullStats(model, C.uniformViews(16, 48));
  const g = C.greedyViews(model, 8);
  const g8 = C.hullStats(model, g.chosen);
  rows.push({
    shape: name,
    gt: u4.gt,
    uniform4: { iou: Number(u4.iou.toFixed(5)), kept: u4.kept },
    uniform8: { iou: Number(u8.iou.toFixed(5)), kept: u8.kept },
    uniform16: { iou: Number(u16.iou.toFixed(5)), kept: u16.kept },
    greedy8: { iou: Number(g8.iou.toFixed(5)), kept: g8.kept, views: g.chosen },
    greedyBeatsUniform8: g8.iou > u8.iou,
    greedyBeatsUniform16: g8.iou > u16.iou,
    falseNegative: g8.falseNegative,
  });
}
const wins8 = rows.filter((r) => r.greedyBeatsUniform8).length;
const wins16 = rows.filter((r) => r.greedyBeatsUniform16).length;
const out = { grid: `${grid}^3`, maskRes: `${maskRes}^2`, views: views.length, winsVsUniform8: `${wins8}/${rows.length}`, winsVsUniform16: `${wins16}/${rows.length}`, rows };
writeFileSync(new URL('./generalize.json', import.meta.url), JSON.stringify(out, null, 2) + '\n');
for (const r of rows) {
  console.log(`${r.shape}: gt=${r.gt} u4=${r.uniform4.iou} u8=${r.uniform8.iou} u16=${r.uniform16.iou} greedy8=${r.greedy8.iou} fn=${r.falseNegative}`);
}
console.log(`greedy8 wins vs uniform8: ${wins8}/${rows.length}; vs uniform16: ${wins16}/${rows.length}`);
