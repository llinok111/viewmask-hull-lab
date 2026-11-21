// Renderer only: consumes src/core.mjs output. No geometry is recomputed here.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as C from './src/core.mjs';

const el = (id) => document.getElementById(id);
const ui = {
  k: el('k'), kval: el('kval'), mode: el('mode'), grid: el('grid'), gt: el('gt'), kept: el('kept'),
  only: el('only'), iou: el('iou'), wit: el('wit'), fn: el('fn'), sig: el('sig'), status: el('status'),
};

const scene = await fetch('./data/scene.json').then((r) => r.json());
const model = C.buildModel({
  shape: scene.shape, views: scene.views, n: scene.grid, res: scene.maskRes, worldRadius: scene.worldRadius,
});
ui.status.textContent = 'core model built in-browser (same module as node bench)';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
el('app').appendChild(renderer.domElement);

const view = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.05, 100);
view.position.set(3.1, 2.3, 3.1);

const controls = new OrbitControls(view, renderer.domElement);
controls.target.set(0, 0, 0);
controls.enableDamping = true;

const world = new THREE.Scene();
world.background = new THREE.Color(0x0b0e13);
world.add(new THREE.HemisphereLight(0xbcd4ff, 0x10131a, 1.6));
const key = new THREE.DirectionalLight(0xffffff, 1.4);
key.position.set(3, 5, 2);
world.add(key);
const grid = new THREE.GridHelper(4, 16, 0x1f2a3a, 0x141c27);
grid.position.y = -1.02;
world.add(grid);

const voxel = (2 * scene.shape.scale) / scene.grid;
const geometry = new THREE.BoxGeometry(voxel * 0.94, voxel * 0.94, voxel * 0.94);
const matGt = new THREE.MeshStandardMaterial({ color: 0x3ddc97, roughness: 0.55, metalness: 0.1 });
const matHull = new THREE.MeshStandardMaterial({ color: 0xff8a3d, roughness: 0.5, metalness: 0.15 });

const capacity = model.n ** 3;
const instGt = new THREE.InstancedMesh(geometry, matGt, capacity);
const instHull = new THREE.InstancedMesh(geometry, matHull, capacity);
instGt.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
instHull.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
world.add(instGt, instHull);

const dummy = new THREE.Object3D();
function update(selection) {
  const stats = C.hullStats(model, selection);
  const [mLo, mHi] = C.subsetWords(selection);
  let a = 0;
  let b = 0;
  const n = model.n;
  for (let k = 0; k < n; k++) {
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const idx = (k * n + j) * n + i;
        if (model.gt[idx]) {
          dummy.position.set((i + 0.5) / n * 2 - 1, (j + 0.5) / n * 2 - 1, (k + 0.5) / n * 2 - 1);
          dummy.scale.setScalar(scene.shape.scale);
          dummy.updateMatrix();
          instGt.setMatrixAt(a++, dummy.matrix);
        } else if (C.hasAll(model.coverage.lo[idx], model.coverage.hi[idx], mLo, mHi)) {
          dummy.position.set((i + 0.5) / n * 2 - 1, (j + 0.5) / n * 2 - 1, (k + 0.5) / n * 2 - 1);
          dummy.scale.setScalar(scene.shape.scale);
          dummy.updateMatrix();
          instHull.setMatrixAt(b++, dummy.matrix);
        }
      }
    }
  }
  instGt.count = a;
  instHull.count = b;
  instGt.instanceMatrix.needsUpdate = true;
  instHull.instanceMatrix.needsUpdate = true;
  ui.grid.textContent = `${n}³ = ${stats.total.toLocaleString()}`;
  ui.gt.textContent = stats.gt.toLocaleString();
  ui.kept.textContent = stats.kept.toLocaleString();
  ui.only.textContent = stats.hullOnly.toLocaleString();
  ui.iou.textContent = `${(stats.iou * 100).toFixed(3)}%`;
  ui.wit.textContent = `${stats.fullWitnesses.toLocaleString()}/${stats.kept.toLocaleString()}`;
  ui.fn.textContent = String(stats.falseNegative);
  ui.sig.textContent = selection.slice().sort((x, y) => x - y).join(',');
  return stats;
}

function refresh() {
  const k = Number(ui.k.value);
  ui.kval.textContent = String(k);
  const selection = ui.mode.value === 'greedy'
    ? C.greedyViews(model, k).chosen
    : C.uniformViews(k, model.views.length);
  update(selection);
}

ui.k.addEventListener('input', refresh);
ui.mode.addEventListener('change', refresh);
refresh();

addEventListener('resize', () => {
  view.aspect = innerWidth / innerHeight;
  view.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(world, view);
});
