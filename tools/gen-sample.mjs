// Deterministic sample generator: writes data/scene.json (shape + 48 candidate
// views + resolution contract). Same command twice => identical bytes.
import { writeFileSync, mkdirSync } from 'node:fs';
import { defaultShape, fibonacciViews } from '../src/core.mjs';

const shape = defaultShape(1);
const views = fibonacciViews(48).map((v) => v.map((x) => Number(x.toFixed(12))));
const scene = {
  name: 'viewmask-hull-sample',
  seed: 20261121,
  grid: 48,
  maskRes: 96,
  worldRadius: 1.62,
  shape,
  views,
  contract: {
    voxelSampling: 'cell centres',
    silhouetteDilationPx: 1,
    note: 'dilation is the only tolerance; it makes false negatives impossible by construction',
  },
};
mkdirSync(new URL('../data/', import.meta.url), { recursive: true });
const json = JSON.stringify(scene, null, 2) + '\n';
writeFileSync(new URL('../data/scene.json', import.meta.url), json);
console.log(`data/scene.json written: ${json.length} bytes, ${views.length} views, grid ${scene.grid}`);
