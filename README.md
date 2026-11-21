# viewmask-hull-lab

**Sparse-view visual hull as a 48-bit mask intersection: 8 greedily selected views reach 74.297% IoU against the analytic solid, versus 62.814% for the 4-view baseline (+18.3% relative) and 71.577% for 16 evenly spread views — with 15,780 → 13,341 kept voxels and 0 false negatives on a 48³ grid.**

Upstream: none

## 本轮创新

以前的可视外壳实现是「逐视角重复 carving」：每加一个视角就把整个体素网格重扫一遍，且没有任何逐体素证据能说明为什么某个体素被保留或剔除。本轮把 48 个候选视角压成**每个体素一个 48 位覆盖掩码**（两个 `Uint32`），于是 (a) 任意视角子集的 hull 变成一次按位包含测试，(b) 每个保留体素天然持有逐视角的 silhouette 见证、每个剔除体素持有一个「视角+像素」的反证，(c) 下一步视角可以直接用「能剔除多少体素」精确贪心选择。结果是 8 个贪心视角在精度上打赢 16 个均匀视角，而这套贪心在旧的重复 carving 实现里要慢一个量级。档位 **B**；与台账中 Voronoi/offset/contact/geodesic 等几何证书不同，本工具的新东西是**视角覆盖位掩码 + 视角选择的可复算增益**，不是又一个网格谓词。

## How to run

```bash
node tools/gen-sample.mjs        # deterministic sample: data/scene.json (48 views)
node bench/verify.mjs            # 34 assertions, exits 0
node bench/bench.mjs             # writes bench/result.json, 1 cold + 5 warm runs
python3 -m http.server 4173      # then open http://localhost:4173
```

No npm install, no bundler, no headless browser. `index.html` pins three.js 0.160.0 through an importmap and loads the same `src/core.mjs` that node uses.

## Evidence (from `bench/result.json`, run 2026-11-21)

Grid 48³ = 110,592 voxels, analytic solid = 9,912 voxels (8.96%). Silhouettes are 96² per view, 48 candidate views.

| selection | views | kept voxels | hull-only | IoU |
| --- | --- | --- | --- | --- |
| baseline: uniform spread | 4 | 15,780 | 5,868 | 62.814% |
| uniform spread | 8 | 14,399 | 4,487 | 68.838% |
| uniform spread | 16 | 13,848 | 3,936 | 71.577% |
| **greedy max-carve** | **8** | **13,341** | **3,429** | **74.297%** |

* Baseline code: `node baseline/uniform4.mjs` (direct per-pixel projection, no cached bitmasks); it reports the same 15,780 / 62.814%.
* `false negatives = 0` at every k tested (2, 4, 8, 12, 16, 24, greedy-8); every kept voxel has all selected in-mask witnesses (13,341/13,341) and every carved voxel owns an exclusion witness (97,251/97,251).
* Rebuild is bit-identical: hull fingerprint `3446855050`, ground-truth fingerprint `2118723633`, all 48 silhouette masks byte-equal.
* Scale invariance: the same solid scaled to 1e-6, 1e-3, 1, 1e3, 1e6 yields the identical hull fingerprint `3446855050` (5/5).
* Timing: cold total 363.610 ms; warm total median 232.542 ms (min 232.299, p95 243.590, stddev 4.336, relStddev 1.86%, n=5). Build median 167.740 ms; greedy-8 median 58.024 ms.

### Generalisation (`node bench/generalize.mjs`, 5 shapes at 40³, 48 views, 0 false negatives each)

| shape | ground truth | uniform-4 | uniform-8 | uniform-16 | greedy-8 |
| --- | --- | --- | --- | --- | --- |
| sample: rotated 4-box | 5,892 | 62.976% | 68.977% | 71.784% | **74.095%** |
| zigzag 3-box | 2,696 | 49.687% | 51.362% | 57.143% | **59.514%** |
| split plate, 3 slabs | 6,912 | 71.228% | 72.045% | 73.081% | **75.327%** |
| orthogonal L | 3,920 | 68.990% | 70.113% | 70.976% | **76.043%** |
| cross, 45° | 2,784 | 55.836% | 58.194% | 60.052% | **60.972%** |

Greedy-8 wins against uniform-8 **5/5** and against uniform-16 **5/5** shapes. Machine-readable output: `bench/generalize.json`.

## Known limitations

* The silhouette masks are dilated by exactly **1 pixel** (96² grid) so that sampling voxel centres can never create a false negative. That dilation is the only tolerance in the pipeline and it slightly inflates every hull; it is disclosed rather than tuned per result.
* The test solid is a union of four yaw-rotated boxes. Visual hulls cannot recover true concavities (e.g. holes), so IoU stays below 1 even with 24 views; this is a property of the method, not a bug hidden by the metric.
* `k` is capped at 24 in the UI because the coverage words hold 48 bits; more views would need a third word.
* Greedy selection is myopic: it minimises the next hull volume, not the final IoU, and it is not proven optimal. It beats uniform-8 and uniform-16 on all 5 shapes tried (one sample at 48³, four extra shapes at 40³) against the same 48 candidate directions; it may lose on shapes with very different symmetries, and no exhaustive optimal-subset search was run.
* Rendering draws up to ~15k instanced boxes; it is a viewer, not a performance claim.

## Layout

```
src/core.mjs        pure geometry: boxes, silhouettes, coverage masks, hull stats, greedy views
main.js             three.js renderer; only displays core output
tools/gen-sample.mjs  deterministic data/scene.json
bench/verify.mjs    34 assertions (witnesses, IoU ordering, determinism, 6-scale invariance)
bench/bench.mjs     1 cold + 5 warm samples -> bench/result.json
baseline/uniform4.mjs  4-view accuracy baseline, independent projection loop
```
