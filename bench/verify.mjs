// Assertions for the visual-hull core. Every number printed is recomputed.
import { readFileSync } from 'node:fs';
import * as C from '../src/core.mjs';

let pass = 0;
let fail = 0;
const results = [];
function ok(name, cond, detail) {
  if (cond) { pass++; results.push(['PASS', name, detail]); }
  else { fail++; results.push(['FAIL', name, detail]); }
}

const scene = JSON.parse(readFileSync(new URL('../data/scene.json', import.meta.url), 'utf8'));
const shape = scene.shape;
const views = scene.views;

ok('A1 scene contract', scene.grid === 48 && views.length === 48 && scene.maskRes === 96, `grid=${scene.grid} views=${views.length} res=${scene.maskRes}`);
ok('A2 all views are unit vectors', views.every((v) => Math.abs(Math.hypot(...v) - 1) < 1e-9), `maxErr=${Math.max(...views.map((v) => Math.abs(Math.hypot(...v) - 1))).toExponential(2)}`);

const model = C.buildModel({ shape, views, n: scene.grid, res: scene.maskRes, worldRadius: scene.worldRadius });
const gtCount = model.gt.reduce((a, b) => a + b, 0);
ok('A3 ground truth non-trivial', gtCount > 9000 && gtCount < 110592, `gtVoxels=${gtCount}`);

const ks = [2, 4, 8, 12, 16, 24];
const stats = {};
for (const k of ks) {
  const s = C.hullStats(model, C.uniformViews(k, views.length));
  stats[k] = s;
  ok(`A4 k=${k} no false negative`, s.falseNegative === 0, `fn=${s.falseNegative} kept=${s.kept}`);
  ok(`A5 k=${k} witness completeness`, s.fullWitnesses === s.kept && s.witnesses === s.carved,
    `fullWitnesses=${s.fullWitnesses}/${s.kept} carvedWitnesses=${s.witnesses}/${s.carved}`);
  ok(`A6 k=${k} iou in (0,1]`, s.iou > 0 && s.iou <= 1, `iou=${s.iou.toFixed(5)} hullOnly=${s.hullOnly}`);
}

const g = C.greedyViews(model, 8);
const gs = C.hullStats(model, g.chosen);
ok('A7 greedy picks exactly 8 distinct views', new Set(g.chosen).size === 8, `views=${g.chosen.join(',')}`);
ok('A8 greedy hull strictly shrinks each step', g.trace.every((t, i) => i === 0 || t.hull < g.trace[i - 1].hull), g.trace.map((t) => t.hull).join('>'));
ok('A9 greedy has no false negative', gs.falseNegative === 0, `fn=${gs.falseNegative}`);
ok('A10 greedy witnesses complete', gs.fullWitnesses === gs.kept && gs.witnesses === gs.carved, `${gs.fullWitnesses}/${gs.kept}, ${gs.witnesses}/${gs.carved}`);
ok('A11 more uniform views help (4 -> 8)', stats[4].iou < stats[8].iou, `${stats[4].iou.toFixed(5)} < ${stats[8].iou.toFixed(5)}`);
ok('A12 greedy8 beats uniform4', gs.iou > stats[4].iou, `${gs.iou.toFixed(5)} > ${stats[4].iou.toFixed(5)}`);
ok('A13 greedy8 beats uniform8', gs.iou > stats[8].iou, `${gs.iou.toFixed(5)} > ${stats[8].iou.toFixed(5)}`);
ok('A14 greedy8 beats uniform16', gs.iou > stats[16].iou, `${gs.iou.toFixed(5)} > ${stats[16].iou.toFixed(5)}`);

// Independent re-derivation for sampled voxels: project the centre through every
// selected view and read the mask directly, bypassing the cached coverage words.
function independentKeep(i, j, k, viewIndices) {
  const p = C.voxelCenter(i, j, k, scene.grid, shape.scale);
  for (const v of viewIndices) {
    const b = C.viewBasis(views[v]);
    const sx = C.dot(p, b.e1);
    const sy = C.dot(p, b.e2);
    const R = scene.worldRadius;
    if (Math.abs(sx) > R || Math.abs(sy) > R) return false;
    const px = Math.min(scene.maskRes - 1, Math.max(0, Math.floor((sx + R) / (2 * R) * scene.maskRes)));
    const py = Math.min(scene.maskRes - 1, Math.max(0, Math.floor((sy + R) / (2 * R) * scene.maskRes)));
    if (!model.masks[v][py * scene.maskRes + px]) return false;
  }
  return true;
}
let mismatch = 0;
let checked = 0;
const n = scene.grid;
for (let idx = 0; idx < n * n * n; idx += 7) {
  const i = idx % n;
  const j = Math.floor(idx / n) % n;
  const k = Math.floor(idx / (n * n));
  const cached = C.hasAll(model.coverage.lo[idx], model.coverage.hi[idx], ...C.subsetWords(g.chosen));
  if (cached !== independentKeep(i, j, k, g.chosen)) mismatch++;
  checked++;
}
ok('A15 cached bitmask == direct mask reads', mismatch === 0, `checked=${checked} mismatch=${mismatch}`);

// Determinism: full rebuild must reproduce the exact same hull signature.
const model2 = C.buildModel({ shape, views, n: scene.grid, res: scene.maskRes, worldRadius: scene.worldRadius });
const sigA = C.hullSignature(model, g.chosen);
const sigB = C.hullSignature(model2, g.chosen);
let maskSame = true;
for (let v = 0; v < views.length; v++) {
  let diff = 0;
  for (let i = 0; i < model.masks[v].length; i++) if (model.masks[v][i] !== model2.masks[v][i]) diff++;
  if (diff !== 0) maskSame = false;
}
ok('A16 rebuild is bit-identical', sigA.hull === sigB.hull && sigA.groundTruth === sigB.groundTruth && maskSame,
  `hull=${sigA.hull} gt=${sigA.groundTruth} masksSame=${maskSame}`);

// Scale invariance: same solid multiplied by s, same normalised grid and view set.
const scales = [1e-6, 1e-3, 1, 1e3, 1e6];
const baseSig = sigA.hull;
let scaleSame = true;
const scaleSigs = [];
for (const s of scales) {
  const sm = C.buildModel({ shape: C.defaultShape(s), views, n: scene.grid, res: scene.maskRes, worldRadius: scene.worldRadius * s });
  const ss = C.hullSignature(sm, g.chosen);
  scaleSigs.push(`${s}:${ss.hull}`);
  if (ss.hull !== baseSig) scaleSame = false;
}
ok('A17 hull signature invariant across 1e-6..1e6', scaleSame, scaleSigs.join(' '));

// Bitmask round-trip: subsetWords is an exact encoding.
ok('A18 subsetWords round-trip', C.subsetWords(g.chosen).length === 2 && C.subsetWords([0, 31]).join(',') === '2147483649,0', `words=${C.subsetWords(g.chosen).join(',')}`);

// Volume bookkeeping is exact at the voxel level.
ok('A19 hull volume = kept * voxel volume', Math.abs(stats[8].hullVolume - stats[8].kept * Math.pow(2 * shape.scale / n, 3)) < 1e-18, `vol=${stats[8].hullVolume.toExponential(6)}`);

for (const [s, name, detail] of results) console.log(`${s} ${name}: ${detail}`);
console.log(`\n${pass}/${pass + fail} assertions passed`);
console.log(`metric: greedy8 iou=${gs.iou.toFixed(5)} vs uniform4=${stats[4].iou.toFixed(5)} vs uniform16=${stats[16].iou.toFixed(5)}; gt=${gtCount} hull8=${gs.kept}`);
process.exit(fail === 0 ? 0 : 1);
