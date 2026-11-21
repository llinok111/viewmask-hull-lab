// Pure geometry core: sparse-view visual hull by bitmask intersection.
// No three.js, no DOM, no I/O, no environment reads.
//
// Model: a solid made of yaw-rotated boxes (union). A voxel grid samples the
// occupancy analytically. Each candidate orthographic view produces a
// silhouette mask. A voxel is kept iff its projected centre lands inside every
// selected silhouette. Masks are dilated by one pixel so centre sampling can
// never produce a false negative; that dilation is the only tolerance and is
// reported in the README.

const TAU = Math.PI * 2;

export function normalize(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

export function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

// Deterministic, evenly spread directions on the unit sphere (Fibonacci).
export function fibonacciViews(count) {
  const out = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (2 * (i + 0.5)) / count;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const a = i * golden;
    out.push(normalize([Math.cos(a) * r, y, Math.sin(a) * r]));
  }
  return out;
}

export function viewBasis(dir) {
  const d = normalize(dir);
  const upHint = Math.abs(d[1]) > 0.94 ? [1, 0, 0] : [0, 1, 0];
  const e1 = normalize(cross(upHint, d));
  const e2 = cross(d, e1);
  return { d, e1, e2 };
}

export function defaultShape(scale = 1) {
  const s = scale;
  return {
    scale: s,
    boxes: [
      { c: [-0.28 * s, 0, -0.40 * s], h: [0.54 * s, 0.28 * s, 0.22 * s], yaw: Math.PI / 4 },
      { c: [0.30 * s, 0, -0.06 * s], h: [0.22 * s, 0.28 * s, 0.52 * s], yaw: -Math.PI / 5 },
      { c: [-0.10 * s, 0, 0.42 * s], h: [0.46 * s, 0.28 * s, 0.22 * s], yaw: Math.PI / 3 },
      { c: [0.64 * s, 0, 0.36 * s], h: [0.18 * s, 0.28 * s, 0.34 * s], yaw: Math.PI / 12 },
    ],
  };
}

function rotateY(p, yaw) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [c * p[0] + s * p[2], p[1], -s * p[0] + c * p[2]];
}

export function insideBox(p, box) {
  const q = rotateY(p, -box.yaw);
  return (
    Math.abs(q[0] - box.c[0]) <= box.h[0] &&
    Math.abs(q[1] - box.c[1]) <= box.h[1] &&
    Math.abs(q[2] - box.c[2]) <= box.h[2]
  );
}

export function insideShape(p, shape) {
  for (let i = 0; i < shape.boxes.length; i++) if (insideBox(p, shape.boxes[i])) return true;
  return false;
}

// Ray vs yaw-rotated axis-aligned box (slab test in box local frame).
function rayBox(o, d, box) {
  const lo = rotateY(o, -box.yaw);
  const ld = rotateY(d, -box.yaw);
  let tmin = -Infinity;
  let tmax = Infinity;
  for (let a = 0; a < 3; a++) {
    const oc = lo[a] - box.c[a];
    const h = box.h[a];
    if (Math.abs(ld[a]) < 1e-15) {
      if (oc < -h || oc > h) return false;
    } else {
      let t1 = (-h - oc) / ld[a];
      let t2 = (h - oc) / ld[a];
      if (t1 > t2) [t1, t2] = [t2, t1];
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return false;
    }
  }
  return tmax >= Math.max(tmin, 0);
}

export function rayHitsShape(o, d, shape) {
  for (let i = 0; i < shape.boxes.length; i++) if (rayBox(o, d, shape.boxes[i])) return true;
  return false;
}

export function dilateMask(mask, res) {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < res; y++) {
    for (let x = 0; x < res; x++) {
      if (!mask[y * res + x]) continue;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= res) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= res) continue;
          out[yy * res + xx] = 1;
        }
      }
    }
  }
  return out;
}

export function buildSilhouette(shape, dir, res, worldRadius) {
  const { d, e1, e2 } = viewBasis(dir);
  const R = worldRadius;
  const mask = new Uint8Array(res * res);
  const camDist = R * 4;
  for (let j = 0; j < res; j++) {
    const y = ((j + 0.5) / res * 2 - 1) * R;
    for (let i = 0; i < res; i++) {
      const x = ((i + 0.5) / res * 2 - 1) * R;
      const o = [
        e1[0] * x + e2[0] * y - d[0] * camDist,
        e1[1] * x + e2[1] * y - d[1] * camDist,
        e1[2] * x + e2[2] * y - d[2] * camDist,
      ];
      if (rayHitsShape(o, d, shape)) mask[j * res + i] = 1;
    }
  }
  return dilateMask(mask, res);
}

export function voxelCenter(i, j, k, n, scale) {
  return [((i + 0.5) / n * 2 - 1) * scale, ((j + 0.5) / n * 2 - 1) * scale, ((k + 0.5) / n * 2 - 1) * scale];
}

export function computeGroundTruth(shape, n) {
  const s = shape.scale;
  const gt = new Uint8Array(n * n * n);
  for (let k = 0; k < n; k++) {
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        if (insideShape(voxelCenter(i, j, k, n, s), shape)) gt[(k * n + j) * n + i] = 1;
      }
    }
  }
  return gt;
}

// coverage: two Uint32 words per voxel, one bit per candidate view (<= 32*2).
export function computeCoverage(shape, views, masks, n, res, worldRadius) {
  const total = n * n * n;
  const lo = new Uint32Array(total);
  const hi = new Uint32Array(total);
  const s = shape.scale;
  const R = worldRadius;
  const bases = views.map(viewBasis);
  for (let k = 0; k < n; k++) {
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const p = voxelCenter(i, j, k, n, s);
        let l = 0;
        let h = 0;
        for (let v = 0; v < bases.length; v++) {
          const b = bases[v];
          const sx = dot(p, b.e1);
          const sy = dot(p, b.e2);
          if (Math.abs(sx) > R || Math.abs(sy) > R) continue;
          const px = Math.min(res - 1, Math.max(0, Math.floor((sx + R) / (2 * R) * res)));
          const py = Math.min(res - 1, Math.max(0, Math.floor((sy + R) / (2 * R) * res)));
          if (!masks[v][py * res + px]) continue;
          if (v < 32) l |= (1 << v) >>> 0;
          else h |= (1 << (v - 32)) >>> 0;
        }
        lo[(k * n + j) * n + i] = l >>> 0;
        hi[(k * n + j) * n + i] = h >>> 0;
      }
    }
  }
  return { lo, hi, views };
}

export function subsetWords(viewIndices) {
  let lo = 0;
  let hi = 0;
  for (const v of viewIndices) {
    if (v < 32) lo |= (1 << v) >>> 0;
    else hi |= (1 << (v - 32)) >>> 0;
  }
  return [lo >>> 0, hi >>> 0];
}

export function hasAll(covLo, covHi, mLo, mHi) {
  return ((covLo & mLo) >>> 0) === (mLo >>> 0) && ((covHi & mHi) >>> 0) === (mHi >>> 0);
}

export function hullStats(model, viewIndices) {
  const { coverage, gt, n, shape } = model;
  const [mLo, mHi] = subsetWords(viewIndices);
  const total = n * n * n;
  let kept = 0;
  let gtCount = 0;
  let falseNegative = 0;
  let witnesses = 0;
  let fullWitnesses = 0;
  for (let idx = 0; idx < total; idx++) {
    const isGt = gt[idx] === 1;
    if (isGt) gtCount++;
    const keep = hasAll(coverage.lo[idx], coverage.hi[idx], mLo, mHi);
    if (keep) {
      kept++;
      // every kept voxel must carry one in-mask witness per selected view
      let complete = true;
      for (const v of viewIndices) {
        const ok = v < 32 ? (coverage.lo[idx] & (1 << v)) !== 0 : (coverage.hi[idx] & (1 << (v - 32))) !== 0;
        if (!ok) { complete = false; break; }
      }
      if (complete) fullWitnesses++;
    } else if (isGt) {
      falseNegative++;
    } else {
      // every carved voxel must name a view + pixel that excluded it
      for (const v of viewIndices) {
        const ok = v < 32 ? (coverage.lo[idx] & (1 << v)) !== 0 : (coverage.hi[idx] & (1 << (v - 32))) !== 0;
        if (!ok) { witnesses++; break; }
      }
    }
  }
  const voxelVolume = Math.pow((2 * shape.scale) / n, 3);
  return {
    views: viewIndices.slice(),
    k: viewIndices.length,
    total,
    gt: gtCount,
    kept,
    carved: total - kept,
    hullOnly: kept - gtCount + falseNegative,
    falseNegative,
    witnesses,
    fullWitnesses,
    iou: kept > 0 ? gtCount / kept : 0,
    tightness: kept > 0 ? (gtCount / kept) : 0,
    hullVolume: kept * voxelVolume,
    gtVolume: gtCount * voxelVolume,
  };
}

// Greedy next-best-view: at each step keep the view that removes the most
// voxels from the current hull. Deterministic tie-break on view index.
export function greedyViews(model, k, start = []) {
  const { coverage, n } = model;
  const total = n * n * n;
  const chosen = start.slice();
  const trace = [];
  const countWith = (v) => {
    const [mLo, mHi] = subsetWords(chosen.concat([v]));
    let c = 0;
    for (let idx = 0; idx < total; idx++) if (hasAll(coverage.lo[idx], coverage.hi[idx], mLo, mHi)) c++;
    return c;
  };
  while (chosen.length < k) {
    let best = -1;
    let bestCount = Infinity;
    for (let v = 0; v < model.views.length; v++) {
      if (chosen.includes(v)) continue;
      const c = countWith(v);
      if (c < bestCount || (c === bestCount && v < best)) {
        bestCount = c;
        best = v;
      }
    }
    chosen.push(best);
    trace.push({ view: best, hull: bestCount });
  }
  return { chosen, trace };
}

export function uniformViews(k, candidateCount) {
  const out = [];
  for (let i = 0; i < k; i++) {
    const v = Math.round((i * candidateCount) / k) % candidateCount;
    if (!out.includes(v)) out.push(v);
  }
  return out;
}

export function hullSignature(model, viewIndices) {
  const { coverage, gt, n } = model;
  const [mLo, mHi] = subsetWords(viewIndices);
  let h = 2166136261 >>> 0;
  let gtH = 2166136261 >>> 0;
  for (let idx = 0; idx < n * n * n; idx++) {
    const keep = hasAll(coverage.lo[idx], coverage.hi[idx], mLo, mHi) ? 1 : 0;
    h = Math.imul(h ^ keep, 16777619) >>> 0;
    gtH = Math.imul(gtH ^ gt[idx], 16777619) >>> 0;
  }
  return { hull: h, groundTruth: gtH };
}

export function buildModel({ shape, views, n = 48, res = 96, worldRadius = 1.62 }) {
  const gt = computeGroundTruth(shape, n);
  const masks = views.map((d) => buildSilhouette(shape, d, res, worldRadius));
  const coverage = computeCoverage(shape, views, masks, n, res, worldRadius);
  return { shape, views, masks, coverage, gt, n, res, worldRadius };
}
