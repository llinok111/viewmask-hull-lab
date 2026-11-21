// Baseline: visual hull with 4 evenly spread views, carved by direct projection
// (no cached coverage words). This is the accuracy baseline quoted in README.
import { readFileSync } from 'node:fs';
import * as C from '../src/core.mjs';

const scene = JSON.parse(readFileSync(new URL('../data/scene.json', import.meta.url), 'utf8'));
const views = scene.views;
const model = C.buildModel({
  shape: scene.shape, views, n: scene.grid, res: scene.maskRes, worldRadius: scene.worldRadius,
});
const selection = C.uniformViews(4, views.length);
const bases = selection.map((v) => C.viewBasis(views[v]));
const R = scene.worldRadius;
const res = scene.maskRes;
let kept = 0;
let gt = 0;
let fn = 0;
for (let k = 0; k < scene.grid; k++) {
  for (let j = 0; j < scene.grid; j++) {
    for (let i = 0; i < scene.grid; i++) {
      const p = C.voxelCenter(i, j, k, scene.grid, scene.shape.scale);
      let inside = true;
      for (const b of bases) {
        const sx = C.dot(p, b.e1);
        const sy = C.dot(p, b.e2);
        if (Math.abs(sx) > R || Math.abs(sy) > R) { inside = false; break; }
        const px = Math.min(res - 1, Math.max(0, Math.floor((sx + R) / (2 * R) * res)));
        const py = Math.min(res - 1, Math.max(0, Math.floor((sy + R) / (2 * R) * res)));
        if (!model.masks[selection[bases.indexOf(b)]][py * res + px]) { inside = false; break; }
      }
      const isGt = model.gt[(k * scene.grid + j) * scene.grid + i] === 1;
      if (isGt) gt++;
      if (inside) kept++;
      else if (isGt) fn++;
    }
  }
}
const out = { baseline: 'uniform-4', views: selection, kept, gt, falseNegative: fn, iou: gt / kept };
console.log(JSON.stringify(out));
