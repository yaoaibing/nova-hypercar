import * as THREE from 'three';
import { loft, sidePanel, airfoil, roundedBox, Section } from './geo';

/**
 * 车辆建模：全部程序化生成，共 17 个可拆解部件。
 * 坐标约定：车头指向 -z，+x 为车身右侧，y=0 为地面。
 */

export type CategoryId = 'structure' | 'aero' | 'glass' | 'power' | 'light' | 'wheel';

export const CATEGORIES: Record<CategoryId, { name: string; color: string }> = {
  structure: { name: '结构', color: '#5fd8ff' },
  aero: { name: '空气动力', color: '#7cff9e' },
  glass: { name: '玻璃', color: '#a9c8ff' },
  power: { name: '动力', color: '#ffb347' },
  light: { name: '灯光', color: '#ffe066' },
  wheel: { name: '行走', color: '#ff79b0' }
};

export interface PartDef {
  id: string;
  name: string;
  en: string;
  category: CategoryId;
  desc: string;
  tags: string[];
  specs: Array<[string, string]>;
  /** 拆解方向（单位化前） */
  explode: [number, number, number];
}

export const PART_DEFS: PartDef[] = [
  {
    id: 'body',
    name: '车身壳体',
    en: 'Monocoque Shell',
    category: 'structure',
    desc: '碳纤维单体壳结构，承担整车扭转刚度，侧裙与轮拱一体成型。',
    tags: ['碳纤维', '单体壳', '扭转刚度'],
    specs: [
      ['材料', 'T800 碳纤维'],
      ['重量', '98 kg'],
      ['扭转刚度', '42,000 N·m/°']
    ],
    explode: [0, 0, 0]
  },
  {
    id: 'cabin',
    name: '座舱内饰',
    en: 'Cockpit',
    category: 'structure',
    desc: '双座布局，碳纤桶椅、悬浮仪表台与可拆卸方向盘，驾驶舱视角的核心节点。',
    tags: ['桶椅', '仪表台', '方向盘'],
    specs: [
      ['布局', '2 座中置'],
      ['内饰重量', '46 kg'],
      ['方向盘', '可拆卸式']
    ],
    explode: [0, 1.0, 0]
  },
  {
    id: 'windshield',
    name: '风挡与侧窗',
    en: 'Glazing',
    category: 'glass',
    desc: '夹层曲面玻璃，含前风挡、侧窗与后窗，表面镀有红外反射膜。',
    tags: ['夹层玻璃', '红外膜'],
    specs: [
      ['厚度', '4.6 mm'],
      ['透光率', '72%'],
      ['重量', '18 kg']
    ],
    explode: [0, 0.9, -0.6]
  },
  {
    id: 'doorL',
    name: '左车门',
    en: 'Door · Left',
    category: 'structure',
    desc: '剪刀门机构，铰链位于前翼子板根部，开启角度 62°，带电动支撑。',
    tags: ['剪刀门', '电动'],
    specs: [
      ['开启角', '62°'],
      ['重量', '12 kg'],
      ['动作时长', '0.72 s']
    ],
    explode: [-1.4, 0.1, 0]
  },
  {
    id: 'doorR',
    name: '右车门',
    en: 'Door · Right',
    category: 'structure',
    desc: '与左门对称的剪刀门机构，共用同一套动作求值逻辑。',
    tags: ['剪刀门', '对称'],
    specs: [
      ['开启角', '62°'],
      ['重量', '12 kg'],
      ['动作时长', '0.72 s']
    ],
    explode: [1.4, 0.1, 0]
  },
  {
    id: 'hood',
    name: '前舱盖',
    en: 'Front Clamshell',
    category: 'structure',
    desc: '蚌式前舱盖，含导流风道与前部散热出口。',
    tags: ['蚌式', '导流'],
    specs: [
      ['材料', '碳纤维'],
      ['重量', '7.5 kg'],
      ['开启方式', '前翻']
    ],
    explode: [0, 1.0, -1.1]
  },
  {
    id: 'splitter',
    name: '前分流器',
    en: 'Front Splitter',
    category: 'aero',
    desc: '主动式前分流器，高速下压前轴，配合尾翼平衡前后升力。',
    tags: ['主动', '下压力'],
    specs: [
      ['下压力', '61 kg @250'],
      ['可调行程', '32 mm'],
      ['材料', '锻造碳']
    ],
    explode: [0, -0.25, -1.3]
  },
  {
    id: 'diffuser',
    name: '后扩散器',
    en: 'Rear Diffuser',
    category: 'aero',
    desc: '七片式后扩散器，引导底盘气流加速排出，形成地面效应。',
    tags: ['地面效应', '七片'],
    specs: [
      ['下压力', '128 kg @250'],
      ['鳍片', '7 片'],
      ['离地角', '11°']
    ],
    explode: [0, -0.2, 1.4]
  },
  {
    id: 'wing',
    name: '主动尾翼',
    en: 'Active Rear Wing',
    category: 'aero',
    desc: '双支柱主动尾翼，0.7 秒完成展开并锁定俯仰角，DRS 状态可放平。',
    tags: ['主动', 'DRS', '铰链俯仰'],
    specs: [
      ['展开时长', '0.70 s'],
      ['俯仰角', '18°'],
      ['下压力', '204 kg @250']
    ],
    explode: [0, 0.85, 1.1]
  },
  {
    id: 'intake',
    name: '侧进气道',
    en: 'Side Intakes',
    category: 'aero',
    desc: '双层侧进气道，上层为中冷器供气，下层导入尾部散热器。',
    tags: ['中冷', '散热'],
    specs: [
      ['进气量', '2.4 m³/s'],
      ['风阻贡献', '3.1%'],
      ['材料', '碳纤/钛合金']
    ],
    explode: [0, 0.35, 1.0]
  },
  {
    id: 'powertrain',
    name: '动力总成',
    en: 'Powertrain',
    category: 'power',
    desc: '中置 4.0L 双涡轮 V8 混动单元，含电机、变速箱与排气系统。',
    tags: ['V8', '双涡轮', '混动'],
    specs: [
      ['综合功率', '1,063 ps'],
      ['峰值扭矩', '930 N·m'],
      ['0-100', '2.3 s']
    ],
    explode: [0, -0.35, 1.5]
  },
  {
    id: 'headlight',
    name: '前灯组',
    en: 'Headlights',
    category: 'light',
    desc: '矩阵式 LED 前灯组，含日行灯带与自适应远近光，支持体积光投射。',
    tags: ['矩阵 LED', '自适应'],
    specs: [
      ['色温', '5,800 K'],
      ['照射距离', '320 m'],
      ['功耗', '84 W']
    ],
    explode: [0, 0.15, -1.35]
  },
  {
    id: 'taillight',
    name: '尾灯组',
    en: 'Tail Light Bar',
    category: 'light',
    desc: '贯穿式尾灯带，制动时高亮，带流水转向指示。',
    tags: ['贯穿式', '流水转向'],
    specs: [
      ['灯带长度', '1,480 mm'],
      ['响应时间', '38 ms'],
      ['功耗', '26 W']
    ],
    explode: [0, 0.15, 1.35]
  },
  {
    id: 'wheelFL',
    name: '左前轮总成',
    en: 'Wheel · Front Left',
    category: 'wheel',
    desc: '21 寸锻造轮毂，含转向枢轴、随动刹车盘与固定卡钳组。',
    tags: ['锻造', '转向枢轴'],
    specs: [
      ['规格', '265/35 R21'],
      ['轮毂', '锻造铝 21"'],
      ['卡钳', '6 活塞']
    ],
    explode: [-1.15, -0.15, -0.95]
  },
  {
    id: 'wheelFR',
    name: '右前轮总成',
    en: 'Wheel · Front Right',
    category: 'wheel',
    desc: '与左前轮对称，转向时与方向盘联动，卡钳组不随轮胎旋转。',
    tags: ['锻造', '转向联动'],
    specs: [
      ['规格', '265/35 R21'],
      ['轮毂', '锻造铝 21"'],
      ['卡钳', '6 活塞']
    ],
    explode: [1.15, -0.15, -0.95]
  },
  {
    id: 'wheelRL',
    name: '左后轮总成',
    en: 'Wheel · Rear Left',
    category: 'wheel',
    desc: '21 寸后轮，宽胎面 345，承担主要驱动力输出。',
    tags: ['宽胎', '驱动轮'],
    specs: [
      ['规格', '345/30 R21'],
      ['轮毂', '锻造铝 21"'],
      ['卡钳', '4 活塞']
    ],
    explode: [-1.15, -0.15, 1.0]
  },
  {
    id: 'wheelRR',
    name: '右后轮总成',
    en: 'Wheel · Rear Right',
    category: 'wheel',
    desc: '与左后轮对称，刹车盘随轮滚动，卡钳与油管保持固定。',
    tags: ['宽胎', '驱动轮'],
    specs: [
      ['规格', '345/30 R21'],
      ['轮毂', '锻造铝 21"'],
      ['卡钳', '4 活塞']
    ],
    explode: [1.15, -0.15, 1.0]
  }
];

export const PART_IDS = PART_DEFS.map((p) => p.id);

/* ------------------------------------------------------------------ */
/* 车身截面（供壳体、玻璃、舱盖复用）                                   */
/* ------------------------------------------------------------------ */

const S = (z: number, w: number, bot: number, top: number, n = 2.6): Section => ({ z, w, bot, top, n });

const BODY_SECTIONS: Section[] = [
  S(-2.30, 0.50, 0.22, 0.44),
  S(-2.05, 0.70, 0.19, 0.55),
  S(-1.72, 0.86, 0.17, 0.68),
  S(-1.36, 0.95, 0.15, 0.83),
  S(-1.00, 0.99, 0.14, 0.98),
  S(-0.60, 1.00, 0.13, 1.08),
  S(-0.18, 0.99, 0.13, 1.20),
  S(0.28, 0.96, 0.13, 1.23),
  S(0.72, 0.93, 0.13, 1.15),
  S(1.10, 0.93, 0.14, 1.00),
  S(1.50, 0.95, 0.15, 0.90),
  S(1.90, 0.95, 0.17, 0.83),
  S(2.20, 0.88, 0.20, 0.77),
  S(2.34, 0.66, 0.27, 0.70)
];

/** 在 z 区间内插值出一段截面 */
function slice(secs: Section[], z0: number, z1: number, n = 12): Section[] {
  const out: Section[] = [];
  for (let i = 0; i < n; i++) {
    const z = z0 + ((z1 - z0) * i) / (n - 1);
    let a = secs[0];
    let b = secs[secs.length - 1];
    for (let k = 0; k < secs.length - 1; k++) {
      if (z >= secs[k].z && z <= secs[k + 1].z) {
        a = secs[k];
        b = secs[k + 1];
        break;
      }
    }
    const t = b.z === a.z ? 0 : (z - a.z) / (b.z - a.z);
    out.push(S(z, a.w + (b.w - a.w) * t, a.bot + (b.bot - a.bot) * t, a.top + (b.top - a.top) * t, a.n));
  }
  return out;
}

function widthAt(z: number): number {
  let a = BODY_SECTIONS[0];
  let b = BODY_SECTIONS[BODY_SECTIONS.length - 1];
  for (let k = 0; k < BODY_SECTIONS.length - 1; k++) {
    if (z >= BODY_SECTIONS[k].z && z <= BODY_SECTIONS[k + 1].z) {
      a = BODY_SECTIONS[k];
      b = BODY_SECTIONS[k + 1];
      break;
    }
  }
  const t = b.z === a.z ? 0 : (z - a.z) / (b.z - a.z);
  return a.w + (b.w - a.w) * t;
}

/* ------------------------------------------------------------------ */
/* 材质角色                                                            */
/* ------------------------------------------------------------------ */

export type Role =
  | 'paint'
  | 'carbon'
  | 'glass'
  | 'light'
  | 'tail'
  | 'metal'
  | 'rubber'
  | 'interior'
  | 'brake'
  | 'accent';

function mesh(geo: THREE.BufferGeometry, role: Role): THREE.Mesh {
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x8899aa }));
  m.userData.role = role;
  m.castShadow = false;
  m.receiveShadow = false;
  return m;
}

/* ------------------------------------------------------------------ */
/* 各部件                                                              */
/* ------------------------------------------------------------------ */

function buildBody(): THREE.Object3D {
  const g = new THREE.Group();
  const shell = mesh(loft(BODY_SECTIONS, 34), 'paint');
  g.add(shell);

  // 底盘平板
  const floor = mesh(roundedBox(1.62, 0.1, 3.9, 0.05), 'carbon');
  floor.position.set(0, 0.17, 0.1);
  g.add(floor);

  // 轮拱眉
  for (const [x, z] of [
    [-0.88, -1.42],
    [0.88, -1.42],
    [-0.9, 1.48],
    [0.9, 1.48]
  ] as Array<[number, number]>) {
    const arch = mesh(new THREE.TorusGeometry(0.44, 0.035, 6, 18, Math.PI * 0.92), 'carbon');
    arch.rotation.set(Math.PI / 2, 0, 0);
    arch.rotation.y = Math.PI / 2;
    arch.position.set(x, 0.4, z);
    arch.scale.set(1, 1, 0.55);
    g.add(arch);
  }

  // 侧裙
  for (const s of [-1, 1]) {
    const skirt = mesh(sidePanel({ zs: [-0.9, -0.3, 0.4, 1.0, 1.5], x: (z) => s * (widthAt(z) + 0.02), top: () => 0.32, bot: () => 0.19, thick: 0.06, inward: -s }), 'carbon');
    g.add(skirt);
  }
  return g;
}

function buildCabin(): THREE.Object3D {
  const g = new THREE.Group();
  // 地板 + 后隔板
  const base = mesh(roundedBox(1.36, 0.06, 2.0, 0.03), 'interior');
  base.position.set(0, 0.42, 0.25);
  g.add(base);

  for (const s of [-1, 1]) {
    const seatG = new THREE.Group();
    const cushion = mesh(roundedBox(0.44, 0.1, 0.5, 0.05), 'interior');
    cushion.position.set(0, 0.5, 0.42);
    const back = mesh(roundedBox(0.44, 0.62, 0.12, 0.06), 'interior');
    back.position.set(0, 0.78, 0.72);
    back.rotation.x = -0.18;
    const head = mesh(roundedBox(0.26, 0.16, 0.1, 0.05), 'interior');
    head.position.set(0, 1.12, 0.76);
    seatG.add(cushion, back, head);
    seatG.position.set(s * 0.36, 0, -0.15);
    g.add(seatG);
  }

  // 仪表台
  const dash = mesh(roundedBox(1.36, 0.2, 0.42, 0.08), 'interior');
  dash.position.set(0, 0.72, -0.72);
  dash.rotation.x = 0.24;
  g.add(dash);

  const cluster = mesh(roundedBox(0.62, 0.16, 0.05, 0.03), 'accent');
  cluster.position.set(-0.34, 0.86, -0.78);
  cluster.rotation.x = 0.24;
  g.add(cluster);

  const screen = mesh(roundedBox(0.34, 0.2, 0.04, 0.03), 'accent');
  screen.position.set(0.24, 0.82, -0.74);
  screen.rotation.x = 0.24;
  g.add(screen);

  // 方向盘（独立动作节点，驾驶时与转向联动）
  const wheelPivot = new THREE.Group();
  wheelPivot.name = 'steeringWheel';
  wheelPivot.userData.act = 'steeringWheel';
  wheelPivot.position.set(-0.34, 0.86, -0.56);
  wheelPivot.rotation.x = -0.42;
  const rim = mesh(new THREE.TorusGeometry(0.16, 0.022, 8, 26), 'interior');
  wheelPivot.add(rim);
  for (let i = 0; i < 3; i++) {
    const spoke = mesh(roundedBox(0.14, 0.03, 0.02, 0.01), 'interior');
    spoke.rotation.z = (i / 3) * Math.PI * 2;
    spoke.position.set(Math.cos((i / 3) * Math.PI * 2) * 0.08, Math.sin((i / 3) * Math.PI * 2) * 0.08, 0);
    wheelPivot.add(spoke);
  }
  const hub = mesh(roundedBox(0.1, 0.08, 0.04, 0.02), 'accent');
  wheelPivot.add(hub);
  g.add(wheelPivot);

  return g;
}

function buildWindshield(): THREE.Object3D {
  const g = new THREE.Group();
  // 前风挡
  const ws = mesh(loft(slice(BODY_SECTIONS, -1.05, -0.1, 8), 22, { arc: [Math.PI * 0.12, Math.PI * 0.88], scale: 1.012 }), 'glass');
  g.add(ws);
  // 侧窗
  for (const s of [-1, 1]) {
    const side = mesh(
      sidePanel({ zs: [-0.35, 0.0, 0.4, 0.8], x: (z) => s * (widthAt(z) + 0.012), top: () => 1.02, bot: () => 0.72, thick: 0.02, inward: -s }),
      'glass'
    );
    g.add(side);
  }
  // 后窗
  const rear = mesh(loft(slice(BODY_SECTIONS, 0.55, 1.35, 7), 20, { arc: [Math.PI * 0.2, Math.PI * 0.8], scale: 1.012 }), 'glass');
  g.add(rear);
  return g;
}

function buildDoor(side: -1 | 1): THREE.Object3D {
  // 铰链在前翼子板根部：pivot 在前下角。
  // 注意：pivot 自带位移，门板顶点必须换算成**相对 pivot** 的坐标，否则会整体飞出车身。
  const HX = side * 0.82;
  const HY = 0.34;
  const HZ = -0.55;
  const pivot = new THREE.Group();
  pivot.userData.act = side < 0 ? 'doorL' : 'doorR';
  pivot.position.set(HX, HY, HZ);

  const rx = (z: number) => side * (widthAt(z) + 0.015) - HX;
  const rz = (z: number) => z - HZ;
  const rt = (z: number) => (z < -0.1 ? 0.78 + (z + 0.55) * 0.42 : 1.0 - (z + 0.1) * 0.16) - HY;
  const rb = () => 0.34 - HY;

  const zs = [-0.55, -0.2, 0.2, 0.6, 0.98];
  const panel = mesh(
    sidePanel({
      zs: zs.map(rz),
      x: (zz) => rx(zz + HZ),
      top: (zz) => rt(zz + HZ),
      bot: () => rb(),
      thick: 0.08,
      inward: -side
    }),
    'paint'
  );
  pivot.add(panel);

  // 门内板与把手
  const trim = mesh(roundedBox(0.06, 0.1, 0.42, 0.02), 'interior');
  trim.position.set(side * 0.73 - HX, 0.5 - HY, 0.42 - HZ);
  pivot.add(trim);
  const handle = mesh(roundedBox(0.04, 0.035, 0.2, 0.015), 'accent');
  handle.position.set(side * 0.85 - HX, 0.62 - HY, 0.3 - HZ);
  pivot.add(handle);

  // 后视镜（随门）
  const mirror = mesh(roundedBox(0.16, 0.06, 0.08, 0.03), 'carbon');
  mirror.position.set(side * 1.0 - HX, 0.78 - HY, -0.42 - HZ);
  pivot.add(mirror);

  return pivot;
}

function buildHood(): THREE.Object3D {
  const g = new THREE.Group();
  const top = mesh(loft(slice(BODY_SECTIONS, -2.12, -0.98, 9), 24, { arc: [Math.PI * 0.08, Math.PI * 0.92], scale: 1.014 }), 'paint');
  g.add(top);
  // 导流风道
  for (const s of [-1, 1]) {
    const duct = mesh(roundedBox(0.16, 0.05, 0.6, 0.02), 'carbon');
    duct.position.set(s * 0.42, 0.83, -1.55);
    duct.rotation.x = 0.06;
    g.add(duct);
  }
  return g;
}

function buildSplitter(): THREE.Object3D {
  const g = new THREE.Group();
  // 翼型几何已烘焙为：翼展沿 x、弦向沿 z、厚度沿 y —— 这里只需微调仰角，不能再绕 x 翻 90°
  const plate = mesh(airfoil({ span: 1.72, chord: 0.5, thick: 0.055, camber: 0.05 }), 'carbon');
  plate.rotation.x = -0.08;
  plate.position.set(0, 0.2, -2.14);
  plate.scale.set(1, 1, 0.7);
  g.add(plate);
  for (const s of [-1, 1]) {
    const fence = mesh(roundedBox(0.03, 0.17, 0.34, 0.01), 'carbon');
    fence.position.set(s * 0.8, 0.3, -2.06);
    g.add(fence);
    // 连接臂
    const arm = mesh(roundedBox(0.06, 0.06, 0.4, 0.02), 'metal');
    arm.position.set(s * 0.5, 0.3, -1.92);
    g.add(arm);
  }
  return g;
}

function buildDiffuser(): THREE.Object3D {
  const g = new THREE.Group();
  const base = mesh(roundedBox(1.66, 0.07, 0.72, 0.03), 'carbon');
  base.position.set(0, 0.3, 2.12);
  base.rotation.x = -0.22;
  g.add(base);
  for (let i = 0; i < 7; i++) {
    const x = -0.72 + (i / 6) * 1.44;
    const fin = mesh(roundedBox(0.035, 0.2, 0.62, 0.01), 'carbon');
    fin.position.set(x, 0.4, 2.1);
    fin.rotation.x = -0.22;
    g.add(fin);
  }
  // 中央高位刹车灯
  const brake = mesh(roundedBox(0.3, 0.035, 0.03, 0.01), 'light');
  brake.position.set(0, 0.62, 2.3);
  g.add(brake);
  return g;
}

function buildWing(): THREE.Object3D {
  const root = new THREE.Group();

  // 翼面（独立动作节点：俯仰 + 升降）
  const surface = new THREE.Group();
  surface.name = 'wingSurface';
  surface.userData.act = 'wingSurface';
  surface.position.set(0, 0.92, 2.12);

  const blade = mesh(airfoil({ span: 1.68, chord: 0.44, thick: 0.06, camber: 0.13 }), 'carbon');
  blade.rotation.y = Math.PI; // 弦向朝车尾
  surface.add(blade);
  for (const s of [-1, 1]) {
    const endplate = mesh(roundedBox(0.03, 0.3, 0.46, 0.02), 'carbon');
    endplate.position.set(s * 0.85, 0.03, 0.02);
    surface.add(endplate);
  }
  root.add(surface);

  // 支架（独立：随翼面升降伸缩，不参与俯仰翻转）
  for (const s of [-1, 1]) {
    const strut = new THREE.Group();
    strut.userData.act = 'wingStrut';
    strut.userData.side = s;
    strut.position.set(s * 0.62, 0.7, 2.12);
    const strutGeo = roundedBox(0.07, 0.22, 0.12, 0.02);
    strutGeo.translate(0, 0.11, 0); // 底部固定在原点，便于按比例伸长
    const body = mesh(strutGeo, 'carbon');
    strut.add(body);
    root.add(strut);

    // 执行机构（独立：只做伸缩）
    const act = new THREE.Group();
    act.userData.act = 'wingActuator';
    act.position.set(s * 0.62, 0.58, 2.0);
    const rodGeo = new THREE.CylinderGeometry(0.028, 0.028, 0.36, 10);
    rodGeo.translate(0, 0.18, 0);
    const rod = mesh(rodGeo, 'metal');
    act.add(rod);
    const cyl = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.18, 10), 'metal');
    act.add(cyl);
    root.add(act);
  }

  return root;
}

function buildIntake(): THREE.Object3D {
  const g = new THREE.Group();
  for (const s of [-1, 1]) {
    const mouth = mesh(roundedBox(0.14, 0.34, 0.72, 0.05), 'carbon');
    mouth.position.set(s * (widthAt(1.0) + 0.02), 0.62, 1.02);
    g.add(mouth);
    const lower = mesh(roundedBox(0.1, 0.16, 0.5, 0.04), 'carbon');
    lower.position.set(s * (widthAt(1.3) + 0.01), 0.36, 1.28);
    g.add(lower);
  }
  // 车顶进气口
  const scoop = mesh(roundedBox(0.44, 0.12, 0.4, 0.05), 'carbon');
  scoop.position.set(0, 1.2, 0.85);
  g.add(scoop);
  return g;
}

function buildPowertrain(): THREE.Object3D {
  const g = new THREE.Group();
  const block = mesh(roundedBox(0.78, 0.44, 0.72, 0.05), 'metal');
  block.position.set(0, 0.62, 1.18);
  g.add(block);
  for (const s of [-1, 1]) {
    const head = mesh(roundedBox(0.2, 0.2, 0.66, 0.04), 'metal');
    head.position.set(s * 0.34, 0.82, 1.18);
    head.rotation.z = s * 0.44;
    g.add(head);
    const turbo = mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.16, 12), 'metal');
    turbo.rotation.z = Math.PI / 2;
    turbo.position.set(s * 0.44, 0.66, 1.5);
    g.add(turbo);
    const pipe = mesh(new THREE.TorusGeometry(0.16, 0.028, 6, 14, Math.PI * 0.9), 'metal');
    pipe.position.set(s * 0.42, 0.6, 1.62);
    pipe.rotation.set(0, Math.PI / 2, 0);
    g.add(pipe);
  }
  // 排气
  for (const s of [-1, 1]) {
    const tip = mesh(new THREE.CylinderGeometry(0.07, 0.075, 0.22, 14), 'metal');
    tip.rotation.x = Math.PI / 2;
    tip.position.set(s * 0.42, 0.42, 2.24);
    g.add(tip);
  }
  // 电机单元
  const motor = mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.34, 16), 'accent');
  motor.rotation.x = Math.PI / 2;
  motor.position.set(0, 0.5, 0.62);
  g.add(motor);
  // 传动轴
  const shaft = mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.7, 10), 'metal');
  shaft.rotation.x = Math.PI / 2;
  shaft.position.set(0, 0.42, 0.3);
  g.add(shaft);
  return g;
}

function buildHeadlights(): THREE.Object3D {
  const g = new THREE.Group();
  for (const s of [-1, 1]) {
    const housing = mesh(roundedBox(0.5, 0.1, 0.16, 0.03), 'carbon');
    housing.position.set(s * 0.5, 0.62, -2.06);
    g.add(housing);
    const bar = mesh(roundedBox(0.46, 0.05, 0.06, 0.02), 'light');
    bar.position.set(s * 0.5, 0.63, -2.12);
    g.add(bar);
    for (let i = 0; i < 3; i++) {
      const led = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 10), 'light');
      led.rotation.x = Math.PI / 2;
      led.position.set(s * (0.34 + i * 0.16), 0.62, -2.14);
      g.add(led);
    }
    // 下方日行灯钩
    const drl = mesh(roundedBox(0.06, 0.05, 0.3, 0.02), 'light');
    drl.position.set(s * 0.72, 0.5, -1.92);
    g.add(drl);
  }
  return g;
}

function buildTaillight(): THREE.Object3D {
  const g = new THREE.Group();
  const bar = mesh(roundedBox(1.48, 0.055, 0.05, 0.02), 'tail');
  bar.position.set(0, 0.74, 2.32);
  g.add(bar);
  const inner = mesh(roundedBox(1.3, 0.03, 0.03, 0.01), 'tail');
  inner.position.set(0, 0.74, 2.35);
  g.add(inner);
  for (const s of [-1, 1]) {
    const corner = mesh(roundedBox(0.16, 0.1, 0.06, 0.02), 'tail');
    corner.position.set(s * 0.78, 0.72, 2.26);
    corner.rotation.z = s * 0.3;
    g.add(corner);
  }
  return g;
}

function buildWheel(front: boolean, side: -1 | 1): THREE.Object3D {
  const R = front ? 0.35 : 0.37;
  const W = front ? 0.3 : 0.38;
  const root = new THREE.Group(); // 转向枢轴
  root.userData.act = front ? (side < 0 ? 'steerFL' : 'steerFR') : 'steerRear';

  const spin = new THREE.Group();
  spin.userData.act = 'spin';
  root.add(spin);

  const tire = mesh(new THREE.CylinderGeometry(R, R, W, 30, 1, false), 'rubber');
  tire.rotation.z = Math.PI / 2;
  spin.add(tire);
  const shoulder = mesh(new THREE.TorusGeometry(R - 0.02, 0.05, 8, 30), 'rubber');
  shoulder.rotation.y = Math.PI / 2;
  shoulder.position.x = side * (W / 2 - 0.01);
  spin.add(shoulder);

  const rim = mesh(new THREE.CylinderGeometry(R * 0.68, R * 0.68, W * 0.92, 24), 'metal');
  rim.rotation.z = Math.PI / 2;
  spin.add(rim);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const spoke = mesh(roundedBox(W * 0.5, R * 0.62, 0.055, 0.02), 'metal');
    spoke.rotation.x = a;
    spoke.position.set(side * W * 0.22, 0, 0);
    spin.add(spoke);
  }
  const hub = mesh(new THREE.CylinderGeometry(0.075, 0.075, W * 1.05, 14), 'accent');
  hub.rotation.z = Math.PI / 2;
  spin.add(hub);

  // 刹车盘：随车轮滚动
  const disc = mesh(new THREE.CylinderGeometry(R * 0.66, R * 0.66, 0.028, 22), 'brake');
  disc.rotation.z = Math.PI / 2;
  disc.position.x = -side * 0.06;
  spin.add(disc);
  const bell = mesh(new THREE.CylinderGeometry(R * 0.3, R * 0.3, 0.05, 14), 'metal');
  bell.rotation.z = Math.PI / 2;
  bell.position.x = -side * 0.07;
  spin.add(bell);

  // 卡钳 + 油管：挂在枢轴下，不随轮胎旋转
  const caliper = mesh(roundedBox(0.1, 0.19, 0.16, 0.02), 'accent');
  caliper.position.set(-side * 0.06, 0.06, -0.24);
  caliper.rotation.x = 0.2;
  root.add(caliper);
  const hose = mesh(new THREE.TorusGeometry(0.1, 0.014, 6, 14, Math.PI * 0.8), 'rubber');
  hose.position.set(-side * 0.08, 0.16, -0.16);
  hose.rotation.set(0.4, 0.2, 0);
  root.add(hose);

  root.position.set(side * (front ? 0.86 : 0.9), R, front ? -1.42 : 1.48);
  return root;
}

/* ------------------------------------------------------------------ */

export interface VehicleModel {
  root: THREE.Group;
  parts: Record<string, THREE.Object3D>;
  /** 动作节点索引 */
  nodes: {
    wingSurface: THREE.Object3D | null;
    wingStruts: THREE.Object3D[];
    wingActuators: THREE.Object3D[];
    doors: { L: THREE.Object3D | null; R: THREE.Object3D | null };
    steers: Record<string, THREE.Object3D | null>;
    spins: Record<string, THREE.Object3D | null>;
    steeringWheel: THREE.Object3D | null;
  };
  bounds: THREE.Box3;
}

export function buildVehicle(): VehicleModel {
  const root = new THREE.Group();
  root.name = 'vehicle';
  const parts: Record<string, THREE.Object3D> = {};

  const builders: Record<string, () => THREE.Object3D> = {
    body: buildBody,
    cabin: buildCabin,
    windshield: buildWindshield,
    doorL: () => buildDoor(-1),
    doorR: () => buildDoor(1),
    hood: buildHood,
    splitter: buildSplitter,
    diffuser: buildDiffuser,
    wing: buildWing,
    intake: buildIntake,
    powertrain: buildPowertrain,
    headlight: buildHeadlights,
    taillight: buildTaillight,
    wheelFL: () => buildWheel(true, -1),
    wheelFR: () => buildWheel(true, 1),
    wheelRL: () => buildWheel(false, -1),
    wheelRR: () => buildWheel(false, 1)
  };

  for (const def of PART_DEFS) {
    const g = builders[def.id]();
    g.name = 'part:' + def.id;
    g.userData.partId = def.id;
    g.traverse((o) => {
      o.userData.partId = def.id;
    });
    g.userData.basePos = g.position.clone();
    g.userData.baseQuat = g.quaternion.clone();
    g.userData.explode = new THREE.Vector3(...def.explode);
    parts[def.id] = g;
    root.add(g);
  }

  const nodes: VehicleModel['nodes'] = {
    wingSurface: null,
    wingStruts: [],
    wingActuators: [],
    doors: { L: null, R: null },
    steers: {},
    spins: {},
    steeringWheel: null
  };

  for (const def of PART_DEFS) {
    const p = parts[def.id];
    p.traverse((o) => {
      const act = o.userData.act as string | undefined;
      if (!act) return;
      if (act === 'wingSurface') nodes.wingSurface = o;
      else if (act === 'wingStrut') nodes.wingStruts.push(o);
      else if (act === 'wingActuator') nodes.wingActuators.push(o);
      else if (act === 'doorL') nodes.doors.L = o;
      else if (act === 'doorR') nodes.doors.R = o;
      else if (act === 'steeringWheel') nodes.steeringWheel = o;
      else if (act.startsWith('steer')) nodes.steers[def.id] = o;
      else if (act === 'spin') nodes.spins[def.id] = o;
    });
  }

  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root);
  return { root, parts, nodes, bounds };
}
