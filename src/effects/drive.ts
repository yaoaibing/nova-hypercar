import * as THREE from 'three';
import { clamp } from '../core/util';

/* ---------------- 尾焰 ---------------- */

const EXHAUST_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uPower;
  uniform vec3 uCore;
  uniform vec3 uTip;
  varying vec2 vUv;
  void main() {
    float along = vUv.y;               // 0 喷口 → 1 尾端
    float core = smoothstep(0.55, 0.0, along);
    float flick = 0.82 + 0.18 * sin(uTime * 42.0 + along * 14.0);
    float a = (1.0 - along) * uPower * flick * (0.35 + core * 0.9);
    vec3 col = mix(uTip, uCore, core);
    gl_FragColor = vec4(col * (1.4 + core), a);
  }
`;

const EXHAUST_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export interface ExhaustFX {
  root: THREE.Group;
  /** power 0..1（油门），nitro 0..1 */
  set(power: number, nitro: number): void;
  update(t: number): void;
  dispose(): void;
}

export function createExhaust(): ExhaustFX {
  const root = new THREE.Group();
  const geo = new THREE.ConeGeometry(0.16, 1.5, 14, 1, true);
  geo.translate(0, -0.75, 0);
  geo.rotateX(-Math.PI / 2); // 指向 +z（车尾方向）
  const mats: THREE.ShaderMaterial[] = [];

  for (const x of [-0.42, 0.42]) {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPower: { value: 0 },
        uCore: { value: new THREE.Color(0xfff2c8) },
        uTip: { value: new THREE.Color(0x4fb8ff) }
      },
      vertexShader: EXHAUST_VERT,
      fragmentShader: EXHAUST_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, 0.42, 2.26);
    root.add(m);
    mats.push(mat);
  }

  let power = 0;
  let nitro = 0;

  return {
    root,
    set(p, n) {
      power = clamp(p);
      nitro = clamp(n);
    },
    update(t: number) {
      const k = power * (0.55 + nitro * 0.9);
      for (const m of mats) {
        m.uniforms.uTime.value = t;
        m.uniforms.uPower.value = k;
        if (nitro > 0.05) {
          m.uniforms.uTip.value.setHex(0xff7a3d);
          m.uniforms.uCore.value.setHex(0xfff2c8);
        } else {
          m.uniforms.uTip.value.setHex(0x4fb8ff);
          m.uniforms.uCore.value.setHex(0xbfe6ff);
        }
      }
      for (const m of root.children) {
        const s = 0.55 + k * 1.5;
        m.scale.set(0.9 + k * 0.5, 0.9 + k * 0.5, s);
      }
    },
    dispose() {
      geo.dispose();
      mats.forEach((m) => m.dispose());
    }
  };
}

/* ---------------- 轮胎水雾 ---------------- */

const SPRAY_VERT = /* glsl */ `
  attribute float aLife;
  attribute float aSeed;
  uniform float uSize;
  uniform float uTime;
  varying float vA;
  void main() {
    vA = aLife;
    vec3 p = position;
    p.y += sin(uTime * 2.0 + aSeed * 6.0) * 0.05 * (1.0 - aLife);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = uSize * (0.5 + (1.0 - aLife) * 1.6) * (14.0 / max(1.0, -mv.z));
    gl_Position = projectionMatrix * mv;
  }
`;

const SPRAY_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vA;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r = dot(d, d);
    if (r > 0.25) discard;
    float a = (1.0 - r * 4.0) * vA * uOpacity;
    gl_FragColor = vec4(uColor, a);
  }
`;

export interface SprayFX {
  root: THREE.Group;
  /** speed: m/s，wet: 是否在雨夜湿地 */
  update(dt: number, t: number, speed: number, steer: number, wet: boolean): void;
  setQuality(count: number): void;
  dispose(): void;
}

export function createSpray(max = 520): SprayFX {
  const root = new THREE.Group();
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(max * 3);
  const life = new Float32Array(max);
  const seed = new Float32Array(max);
  const vel = new Float32Array(max * 3);
  for (let i = 0; i < max; i++) seed[i] = Math.random();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aLife', new THREE.Float32BufferAttribute(life, 1));
  geo.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1));

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uSize: { value: 26 },
      uTime: { value: 0 },
      uOpacity: { value: 0.32 },
      uColor: { value: new THREE.Color(0xcfe4f2) }
    },
    vertexShader: SPRAY_VERT,
    fragmentShader: SPRAY_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  root.add(points);

  let cursor = 0;
  let active = max;
  let acc = 0;

  return {
    root,
    update(dt, t, speed, steer, wet) {
      mat.uniforms.uTime.value = t;
      const rate = wet ? clamp(speed / 40) * 26 : clamp(speed / 60) * 6;
      acc += rate * dt;
      const born = Math.min(active, Math.floor(acc));
      acc -= born;
      for (let b = 0; b < born; b++) {
        const i = cursor % active;
        cursor++;
        const side = Math.random() < 0.5 ? -1 : 1;
        const rear = Math.random() < 0.6;
        pos[i * 3] = side * 0.88 + (Math.random() - 0.5) * 0.3;
        pos[i * 3 + 1] = 0.1 + Math.random() * 0.12;
        pos[i * 3 + 2] = (rear ? 1.5 : -1.42) + (Math.random() - 0.5) * 0.3;
        vel[i * 3] = side * (0.5 + Math.random() * 0.8) - steer * 1.2;
        vel[i * 3 + 1] = 0.6 + Math.random() * 1.4;
        vel[i * 3 + 2] = (2.5 + speed * 0.05) * (rear ? 1 : 0.7);
        life[i] = 1;
      }
      const decay = dt * 1.5;
      for (let i = 0; i < active; i++) {
        if (life[i] <= 0) continue;
        life[i] = Math.max(0, life[i] - decay);
        pos[i * 3] += vel[i * 3] * dt;
        pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
        pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        vel[i * 3 + 1] -= dt * 0.9;
      }
      (geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      (geo.attributes.aLife as THREE.BufferAttribute).needsUpdate = true;
      mat.uniforms.uOpacity.value = wet ? 0.34 : 0.14;
    },
    setQuality(count: number) {
      active = Math.max(60, Math.min(max, count));
      geo.setDrawRange(0, active);
    },
    dispose() {
      geo.dispose();
      mat.dispose();
    }
  };
}

/* ---------------- 动力概念流线 ---------------- */

const FLOW_FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    float f = fract(vUv.x * 3.0 - uTime * 0.55);
    float pulse = smoothstep(0.0, 0.12, f) * smoothstep(0.45, 0.16, f);
    float edge = sin(vUv.y * 3.14159);
    gl_FragColor = vec4(uColor, uOpacity * (0.25 + pulse * 0.95) * (0.4 + edge * 0.6));
  }
`;

const FLOW_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export interface FlowFX {
  root: THREE.Group;
  setEnabled(on: boolean): void;
  update(t: number): void;
  dispose(): void;
}

export function createFlowLines(): FlowFX {
  const root = new THREE.Group();
  const mats: THREE.ShaderMaterial[] = [];
  const geos: THREE.BufferGeometry[] = [];

  const paths: Array<Array<[number, number, number]>> = [
    [
      [-0.95, 0.62, 1.0],
      [-0.86, 0.7, 0.4],
      [-0.7, 0.78, -0.4],
      [-0.6, 0.6, -1.2],
      [-0.5, 0.5, -2.0]
    ],
    [
      [0.95, 0.62, 1.0],
      [0.86, 0.7, 0.4],
      [0.7, 0.78, -0.4],
      [0.6, 0.6, -1.2],
      [0.5, 0.5, -2.0]
    ],
    [
      [0, 1.18, 0.9],
      [0, 1.22, 0.2],
      [0, 1.1, -0.6],
      [0, 0.9, -1.6]
    ],
    [
      [-0.42, 0.42, 2.2],
      [0, 0.38, 1.5],
      [0.42, 0.42, 2.2]
    ]
  ];

  for (const p of paths) {
    const curve = new THREE.CatmullRomCurve3(p.map((v) => new THREE.Vector3(...v)));
    const geo = new THREE.TubeGeometry(curve, 40, 0.028, 8, false);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(0x5ff0ff) },
        uOpacity: { value: 0.62 }
      },
      vertexShader: FLOW_VERT,
      fragmentShader: FLOW_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    root.add(new THREE.Mesh(geo, mat));
    mats.push(mat);
    geos.push(geo);
  }

  return {
    root,
    setEnabled(on: boolean) {
      root.visible = on;
    },
    update(t: number) {
      for (const m of mats) m.uniforms.uTime.value = t;
    },
    dispose() {
      geos.forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose());
    }
  };
}
