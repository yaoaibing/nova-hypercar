# NOVA HYPERCAR · 超级跑车科技展厅 v2.1

可交互的超级跑车科技展厅：**17 个部件拆解**、**四场景**、**四种着色**、**赛博雨夜高速驾驶**（三视角 + 氮气/尾焰/水雾）、**约 78 秒自动演示**。

技术栈：Vite 5 + TypeScript 5 + Three.js 0.169。**零外部素材**——车辆、场景、贴图全部程序化生成，不下载任何模型或图片。

## 运行

```bash
npm install          # 依赖（three / vite / typescript）
npm run dev          # 开发（http://127.0.0.1:5178）
npm run build        # 类型检查 + 生产构建 → dist/
npm run preview      # 预览构建产物
```

`dist/` 是纯静态产物，可以直接扔到任意静态托管（GitHub Pages / OSS / nginx）。

## 功能

| 模块 | 内容 |
| --- | --- |
| 部件 | 17 个部件（结构 5 / 空气动力 4 / 玻璃 1 / 动力 1 / 灯光 2 / 行走 4），点击选中、显示详情与规格、整体拆解与单件拆解、一键归位 |
| 场景 | 精密展厅 / 工程分析 / 全息实验室 / 赛博雨夜，各自独立的灯光、环境贴图、雾与曝光 |
| 着色 | Surface（车漆+碳纤+玻璃）/ X-Ray / Blueprint（线框）/ Hologram（菲涅尔+扫描线） |
| 画质材质 | High / Balanced / Low 三档 + 电影级 / 赛博两种材质强度、4 种车漆 |
| 机构 | 主动尾翼（翼面俯仰 + 支架/执行机构分离动作）、剪刀门、方向盘与前轮联动、车轮按累计路程滚动 |
| 驾驶 | W/↑ 加速、S/↓ 刹车、A/D 或 ←/→ 转向、Shift 氮气、C 切视角、Esc 退出；驾驶舱 / 车头 / 追车三视角；限速 310 km/h，氮气 +20% |
| 特效 | 氮气尾焰、轮胎水雾、前大灯体积光与真实前照灯、雨丝、湿地反射、动力流线、接地阴影 |
| 演示与摄影 | 78 秒自动演示（可 seek / renderAt 定位）、摄影模式（P）、PNG 截图、全局复位（R） |
| 公共接口 | `window.NOVA`（见下） |

## 关键实现

- **机械动作不累加**：`src/vehicle/actuation.ts` 保存每个节点的基准姿态，用「基准 + 归一化进度的绝对量」求值。实时交互、摄影冻结、自动演示 seek、`NOVA.pose()` 共用同一个 `pose()`，因此任意帧率下终点一致，反复开关不漂移。传入 `pose()` 的覆盖值会持久化，避免被下一帧主循环冲掉。
- **拆解与动作不互相污染**：拆解只写 `position`，机械动作只写 `rotation`/`scale`，两者叠加互不覆盖。
- **车轮结构**：`转向枢轴 → 滚动组（轮胎/轮毂/刹车盘）` + 独立的卡钳与油管（挂在枢轴下，不随轮胎转）；滚动角由累计路程直接算，不做逐帧累加。
- **展厅灯光**：主光负责车身可读性，青色轮廓光 + 少量紫色背光分层；装饰灯环启动渐亮后**常亮**，没有呼吸/频闪；半镜面地面克制使用，不做雨夜湿地波纹；泛光单独限幅（strength 0.26 / threshold 0.88）。
- **循环高速路**：跑步机式循环——车停在原点，8 段路面按行驶距离后移并回收，路灯/霓虹门/城市剪影同步循环，接缝连续、无浮点累积。
- **驾驶舱可见性**：进入座舱视角时隐藏车身外壳与引擎盖（封闭曲面会挡住视野），夜景开启真实前照灯 SpotLight，否则座舱看出去是全黑。

## 验收

真机（Chromium + SwiftShader）实测，脚本在 `shots/`：

- `shots/run.mjs`：19 个状态截图（四场景、四着色、拆解、尾翼、车门、驾驶三视角、氮气、退出、演示定位、摄影），无 JS 报错。
- `shots/diag.mjs`：17 个部件包围盒 + 面法线朝外比例自检，无越界（法线朝外 ≥ 0.8）。
- `shots/actuation-test.mjs`：**10/10 通过**——尾翼展开保持 5 秒零漂移、支架/执行机构同步稳定、`pose()` 与实时展开终点一致、尾翼与车门各开关 20 次精确归位（误差 0）、拆解 16/17 部件位移且归位误差 0、车轮滚动角由路程唯一决定。
- `shots/measure.mjs`：画面亮度实测（0–255），展厅 avg 24.8 / 雨夜 27.2 / 座舱 36.6，无过曝（max 约 244 且为高光点）。

## `window.NOVA` 接口

```js
NOVA.setScene('rain')        // 'showroom' | 'analysis' | 'lab' | 'rain'
NOVA.setShade('xray')        // 'surface' | 'xray' | 'blueprint' | 'hologram'
NOVA.setQuality('high')      // 'high' | 'balanced' | 'low'
NOVA.setFinish('cyber')      // 'cinematic' | 'cyber'
NOVA.setPaint('violet')      // cyan | violet | silver | obsidian
NOVA.selectPart('wing')      // 部件 id 或 null
NOVA.setExplode(0.6)         // 0..1
NOVA.setWing(true) / NOVA.setDoors(true)
NOVA.enterDrive('cockpit') / NOVA.exitDrive() / NOVA.setDriveCam('chase')
NOVA.demo.play() / .pause() / .stop() / .seek(42)
NOVA.pose({ wing: 1, doors: 0, steer: 0.3, distance: 120 })  // 姿态求值（摄影/时间线）
NOVA.screenshot()            // 下载 PNG
NOVA.reset()
```

## 目录

```
src/
  core/        renderer / environment(PMREM) / postfx / state / timeline(78s 演示) / util
  vehicle/     geo(放样·翼型·圆角盒) / model(17 部件) / materials(四着色) / actuation(机械动作)
  scenes/      showroom / analysis / lab / rain
  effects/     weather(雨) / lights(体积光+前照灯) / drive(尾焰·水雾·流线)
  driving/     road(循环高速路) / drive(驾驶状态机+三视角)
  ui/          ui.ts（原生 DOM 面板与 HUD）
  app.ts       装配与主循环
```
