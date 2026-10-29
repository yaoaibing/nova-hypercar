import * as THREE from 'three';
import { clamp } from '../core/util';

/**
 * 车身放样：沿 z 轴给出若干横截面，每个截面是一个超椭圆环。
 * sections 必须按 z 从小到大排列；车头在 -z、车尾在 +z。
 */
export interface Section {
  z: number;
  w: number; // 半宽
  top: number; // 上半高（相对该部件的 y 基准）
  bot: number; // 下半高
  n?: number; // 超椭圆指数，越大越方
  twist?: number;
}

export function loft(
  sections: Section[],
  seg = 30,
  opt: { arc?: [number, number]; caps?: boolean; scale?: number } = {}
): THREE.BufferGeometry {
  const M = sections.length;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const arc = opt.arc;
  const full = !arc;
  const caps = opt.caps ?? full;
  const scale = opt.scale ?? 1;
  const a0 = arc ? arc[0] : 0;
  const a1 = arc ? arc[1] : Math.PI * 2;

  const ringPt = (s: Section, j: number) => {
    const n = s.n ?? 2.5;
    const a = a0 + (full ? j / seg : j / (seg - 1)) * (a1 - a0);
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const e = 2 / n;
    // top / bot 是**离地绝对高度**，截面在 [bot, top] 之间居中
    const mid = (s.top + s.bot) / 2;
    const halfH = Math.max(0.001, (s.top - s.bot) / 2);
    const x = s.w * Math.sign(ca) * Math.pow(Math.abs(ca), e) * scale;
    const y = mid + Math.sign(sa) * Math.pow(Math.abs(sa), e) * halfH * scale;
    return [x, y] as const;
  };

  for (let i = 0; i < M; i++) {
    const s = sections[i];
    for (let j = 0; j < seg; j++) {
      const [x, y] = ringPt(s, j);
      positions.push(x, y, s.z);
      uvs.push(j / seg, i / (M - 1));
    }
  }
  const jMax = full ? seg : seg - 1;
  for (let i = 0; i < M - 1; i++) {
    for (let j = 0; j < jMax; j++) {
      const a = i * seg + j;
      const b = i * seg + ((j + 1) % seg);
      const c = (i + 1) * seg + j;
      const d = (i + 1) * seg + ((j + 1) % seg);
      // 绕序需让面法线朝外（否则 ClosedShell 的光照会整个反掉）
      indices.push(a, b, c, c, b, d);
    }
  }

  if (caps) {
    // 封口点取环的几何中心（上半 top / 下半 bot 的中点），否则端面会被拉成歪锥
    const capA = positions.length / 3;
    const s0 = sections[0];
    positions.push(0, (s0.top + s0.bot) / 2, s0.z);
    uvs.push(0.5, 0);
    for (let j = 0; j < seg; j++) indices.push(capA, (j + 1) % seg, j);

    const capB = positions.length / 3;
    const sN = sections[M - 1];
    const last = (M - 1) * seg;
    positions.push(0, (sN.top + sN.bot) / 2, sN.z);
    uvs.push(0.5, 1);
    for (let j = 0; j < seg; j++) indices.push(capB, last + j, last + ((j + 1) % seg));
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

/** 对已有几何逐顶点形变（就地） */
export function warp(geo: THREE.BufferGeometry, fn: (v: THREE.Vector3) => void) {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    fn(v);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/** 侧面弧形板（车门 / 侧裙 / 翼子板外皮） */
export function sidePanel(opt: {
  zs: number[];
  x: (z: number) => number;
  top: (z: number) => number;
  bot: (z: number) => number;
  thick?: number;
  inward?: number;
}): THREE.BufferGeometry {
  const { zs, x, top, bot } = opt;
  const thick = opt.thick ?? 0.07;
  const inward = opt.inward ?? 1; // +1 表示朝车身内侧加厚
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const N = zs.length;
  for (let i = 0; i < N; i++) {
    const z = zs[i];
    const xx = x(z);
    positions.push(xx, bot(z), z, xx - thick * inward, bot(z), z, xx, top(z), z, xx - thick * inward, top(z), z);
    uvs.push(0, i / (N - 1), 0, i / (N - 1), 1, i / (N - 1), 1, i / (N - 1));
  }
  for (let i = 0; i < N - 1; i++) {
    const a = i * 4;
    const b = (i + 1) * 4;
    // 外表面
    indices.push(a + 0, b + 0, a + 2, a + 2, b + 0, b + 2);
    // 内表面
    indices.push(a + 1, a + 3, b + 1, b + 1, a + 3, b + 3);
    // 上下缘
    indices.push(a + 2, b + 2, a + 3, a + 3, b + 2, b + 3);
    indices.push(a + 0, a + 1, b + 0, b + 0, a + 1, b + 1);
  }
  // 前后端盖
  const lastA = 0;
  indices.push(lastA + 0, lastA + 2, lastA + 1, lastA + 1, lastA + 2, lastA + 3);
  const L = (N - 1) * 4;
  indices.push(L + 0, L + 1, L + 2, L + 2, L + 1, L + 3);

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

/** 翼型板（尾翼 / 分流器）：沿 x 拉伸的机翼剖面 */
export function airfoil(opt: {
  span: number;
  chord: number;
  thick: number;
  camber?: number;
  taper?: number;
  seg?: number;
}): THREE.BufferGeometry {
  const { span, chord, thick } = opt;
  const camber = opt.camber ?? 0.16;
  const seg = opt.seg ?? 18;
  const half = (t: number) => {
    const x = clamp(t);
    return 2.5 * thick * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x * x * x - 0.1015 * x * x * x * x);
  };
  const cb = (t: number) => camber * chord * Math.sin(Math.PI * clamp(t));

  const shape = new THREE.Shape();
  shape.moveTo(-chord / 2, 0);
  for (let i = 1; i <= seg; i++) {
    const t = i / seg;
    shape.lineTo((t - 0.5) * chord, cb(t) + half(t));
  }
  for (let i = seg - 1; i >= 1; i--) {
    const t = i / seg;
    shape.lineTo((t - 0.5) * chord, cb(t) - half(t) * 0.72);
  }
  shape.lineTo(-chord / 2, 0);

  const g = new THREE.ExtrudeGeometry(shape, { depth: span, bevelEnabled: false, steps: 1, curveSegments: 2 });
  g.translate(0, 0, -span / 2);
  g.rotateY(Math.PI / 2);
  g.computeVertexNormals();
  return g;
}

/** 圆角盒：核心盒 + 球面外扩，无额外依赖 */
export function roundedBox(w: number, h: number, d: number, r = 0.06, seg = 5): THREE.BufferGeometry {
  r = Math.min(r, w / 2, h / 2, d / 2);
  const g = new THREE.BoxGeometry(w, h, d, seg, seg, seg);
  warp(g, (v) => {
    const hx = w / 2 - r;
    const hy = h / 2 - r;
    const hz = d / 2 - r;
    const cx = clamp(v.x, -hx, hx);
    const cy = clamp(v.y, -hy, hy);
    const cz = clamp(v.z, -hz, hz);
    const dx = v.x - cx;
    const dy = v.y - cy;
    const dz = v.z - cz;
    const len = Math.hypot(dx, dy, dz);
    if (len > 1e-6) {
      const k = r / len;
      v.set(cx + dx * k, cy + dy * k, cz + dz * k);
    }
  });
  return g;
}

/** 环形排布的辐条等重复体（返回 merge 后的几何，避免额外依赖直接用 Group） */
export function ringCopies<T extends THREE.Object3D>(make: () => T, count: number): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < count; i++) {
    const m = make();
    g.add(m);
    m.userData.index = i;
  }
  return g;
}
