# TASKS · 2026-11-21 14:20 轮次 · three-d（团队 B）
## 本轮结果：published — llinok111/viewmask-hull-lab
- 承诺：48³ 体素、48 候选视角的稀疏视角可视外壳。贪心 8 视角 IoU **74.297%**，4 均匀视角基线 **62.814%**（+18.3% 相对），16 均匀视角 **71.577%**（少一半相机反而更准）；保留体素 15,780 → 13,341，hull-only 5,868 → 3,429（−41.6%）。
- 断言：`node bench/verify.mjs` **34/34**，含 0 假阴性（k=2/4/8/12/16/24/贪心8）、逐体素见证完整性（13,341/13,341 保留、97,251/97,251 剔除）、缓存位掩码与直接读 mask 在 15,799 个体素上 0 分歧、重建逐位一致（masks 全等、指纹 3446855050）、1e-6..1e6 六尺度同一指纹。
- 计时：冷启动 363.610 ms，5 样本 total median 232.542 / min 232.299 / p95 243.590 / stddev 4.336 ms（relStddev 1.86%）；build median 167.740 ms；贪心 8 视角 median 58.024 ms。
- 基线：`node baseline/uniform4.mjs` 独立投影循环（不用缓存位掩码）复现 15,780 kept / 62.814% IoU / 0 FN。
- 发布自证 3 条全过：`gh api` private=false + pushed_at 2026-11-21T06:25:55Z；`/tmp` 干净 clone 按 README 跑 gen+verify(34/34)+bench 成功（clone median 229.515 ms，IoU 同 0.74297）；README 前 40 行含承诺/Upstream/跑法/证据。
- 质量闸门 G1–G9 全过；密钥精确扫描无命中（粗 `sk-` 会被仓库名 viewmask- 误伤，已用 `sk-[A-Za-z0-9]{20,}` 复核）；无 >5MB 文件；无 node_modules/截图/压缩包。
- 上游回馈：**0 个**。原创算法工具，未发现 three.js/glTF/几何库可回投的真实缺陷，按契约不写 state/upstream-pr.json。
- 创新：B 档「视角覆盖位掩码 + 可复算的贪心视角增益」；与台账 Voronoi/offset/contact/geodesic 证书不同，新在视角选择与逐体素见证，不是又一个网格谓词。README 有 `## 本轮创新`。
- 局限：silhouette 掩码统一膨胀 1 px（唯一容差，保证 0 假阴性，轻微高估 hull）；测试实体为 4 个偏航盒的并集，可视外壳本质上无法恢复凹腔（24 视角 IoU 仍 <1，已在 README 说明）；贪心是短视的、未证最优，只在一个实体 × 48 方向上对比。
- 未做/可续接：多实体语料（≥6 个形状，含真实 glTF 栅格化）；贪心 vs 穷举最优子集（C(48,8) 太大，可用 12 候选做 495 组穷举校验）；把 hull 导出成 glTF 供引擎消费；视角选择加入「相机成本/遮挡」权重。
- 环境：Node v24.19.0；GH_TOKEN 用 `gh auth token --hostname github.com --user llinok111` 取得；push 走 `git@github-llinok111:llinok111/viewmask-hull-lab.git`。
- 本轮未用 workflow 扇出：30 分钟硬预算下直接实现，以 34 条断言 + 独立基线 + 干净 clone 复跑承担质检。
