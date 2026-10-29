import * as THREE from 'three';
import type { QualityId } from '../core/state';

/**
 * 雨丝：LineSegments + 顶点着色器循环下落。
 * 雨盒跟随目标（车 / 相机）移动，近处按深度淡出，避免糊成白划痕。
 */
const VERT = /* glsl */ `
  attribute vec3 aBase;
  attribute float aSeed;
  uniform float uTime;
  uniform float uSpeed;
  uniform float uHeight;
  uniform float uLen;
  uniform vec2 uWind;
  varying float vFade;
  void main() {
    vec3 p = aBase;
    float fall = mod(aBase.y - uTime * uSpeed * (0.75 + aSeed * 0.7), uHeight);
    p.y = fall - uHeight * 0.5;
    p.x += uWind.x * (uHeight - fall) * 0.012;
    p.z += uWind.y * (uHeight - fall) * 0.012;
    // position.y 为 0 或 -1，用来拉出雨丝长度
    p.y += position.y * uLen * (0.6 + aSeed * 0.8);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float d = -mv.z;
    vFade = mix(0.15, 1.0, smoothstep(2.0, 16.0, d));
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  uniform float uOpacity;
  uniform vec3 uColor;
  varying float vFade;
  void main() {
    gl_FragColor = vec4(uColor, uOpacity * vFade);
  }
`;

export interface RainFX {
  root: THREE.Group;
  update(dt: number, t: number, focus: THREE.Vector3, speed: number): void;
  setQuality(q: QualityId): void;
  setIntensity(k: number): void;
  dispose(): void;
}

export function createRain(quality: QualityId): RainFX {
  const MAX = 7000;
  const root = new THREE.Group();
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(MAX * 2 * 3);
  const aBase = new Float32Array(MAX * 2 * 3);
  const aSeed = new Float32Array(MAX * 2);
  const H = 26;
  const SPAN = 62;

  for (let i = 0; i < MAX; i++) {
    const x = (Math.random() - 0.5) * SPAN * 2;
    const y = Math.random() * H;
    const z = (Math.random() - 0.5) * SPAN * 2;
    const seed = Math.random();
    for (let k = 0; k < 2; k++) {
      const idx = i * 2 + k;
      pos[idx * 3] = 0;
      pos[idx * 3 + 1] = k === 0 ? 0 : -1;
      pos[idx * 3 + 2] = 0;
      aBase[idx * 3] = x;
      aBase[idx * 3 + 1] = y;
      aBase[idx * 3 + 2] = z;
      aSeed[idx] = seed;
    }
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aBase', new THREE.Float32BufferAttribute(aBase, 3));
  geo.setAttribute('aSeed', new THREE.Float32BufferAttribute(aSeed, 1));

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSpeed: { value: 15 },
      uHeight: { value: H },
      uLen: { value: 0.55 },
      uWind: { value: new THREE.Vector2(0.6, 0.2) },
      uOpacity: { value: 0.26 },
      uColor: { value: new THREE.Color(0xbfd8ea) }
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });

  const lines = new THREE.LineSegments(geo, mat);
  lines.frustumCulled = false;
  root.add(lines);

  let intensity = 1;
  const setQuality = (q: QualityId) => {
    const n = q === 'high' ? MAX : q === 'balanced' ? 4200 : 1800;
    geo.setDrawRange(0, n * 2);
    mat.uniforms.uLen.value = q === 'low' ? 0.45 : 0.55;
  };
  setQuality(quality);

  return {
    root,
    update(dt, t, focus) {
      mat.uniforms.uTime.value = t;
      // 雨盒跟随目标，只跟 xz，避免相机抖动导致雨丝跳动
      root.position.set(focus.x, 0, focus.z);
      void dt;
    },
    setQuality,
    setIntensity(k: number) {
      intensity = k;
      mat.uniforms.uOpacity.value = 0.26 * k;
      mat.uniforms.uSpeed.value = 15 + (k - 1) * 6;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
      void intensity;
    }
  };
}
