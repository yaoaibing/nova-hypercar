import * as THREE from 'three';
import { Role, CATEGORIES, CategoryId } from './model';

export type ShadeId = 'surface' | 'xray' | 'blueprint' | 'hologram';
export type FinishId = 'cinematic' | 'cyber';

export const SHADES: Array<{ id: ShadeId; name: string }> = [
  { id: 'surface', name: 'Surface' },
  { id: 'xray', name: 'X-Ray' },
  { id: 'blueprint', name: 'Blueprint' },
  { id: 'hologram', name: 'Hologram' }
];

export const PAINTS: Array<{ id: string; name: string; color: number }> = [
  { id: 'cyan', name: '量子青', color: 0x0f6f8c },
  { id: 'violet', name: '星云紫', color: 0x5a2a8c },
  { id: 'silver', name: '液态银', color: 0x9aa6b2 },
  { id: 'obsidian', name: '曜石黑', color: 0x14161c }
];

/** 需要每帧推进时间的着色材质 */
export interface ShadeMaterials {
  surface: Record<Role, THREE.Material>;
  xray: Record<Role, THREE.Material>;
  blueprint: Record<Role, THREE.Material>;
  hologram: Record<Role, THREE.Material>;
}

const HOLO_VERT = /* glsl */ `
  varying vec3 vN;
  varying vec3 vW;
  void main() {
    vN = normalize(normalMatrix * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vW = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const HOLO_FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor;
  uniform vec3 uColor2;
  uniform float uOpacity;
  uniform float uScan;
  varying vec3 vN;
  varying vec3 vW;
  void main() {
    vec3 vd = normalize(cameraPosition - vW);
    float f = pow(1.0 - abs(dot(normalize(vN), vd)), 2.2);
    float scan = sin(vW.y * 26.0 - uTime * 2.6) * 0.5 + 0.5;
    float line = smoothstep(0.82, 1.0, scan) * uScan;
    float band = smoothstep(0.4, 0.0, abs(fract(vW.z * 0.35 - uTime * 0.06) - 0.5));
    vec3 col = mix(uColor, uColor2, clamp(f * 1.4, 0.0, 1.0));
    float a = uOpacity * (0.22 + f * 0.9 + line * 0.7 + band * 0.12);
    gl_FragColor = vec4(col * (0.5 + f * 1.1 + line * 1.2), a);
  }
`;

function holoMat(color: number, color2: number, opacity: number, scan: number, uniforms: Record<string, THREE.IUniform>) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: uniforms.uTime,
      uColor: { value: new THREE.Color(color) },
      uColor2: { value: new THREE.Color(color2) },
      uOpacity: { value: opacity },
      uScan: { value: scan }
    },
    vertexShader: HOLO_VERT,
    fragmentShader: HOLO_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide
  });
}

export class MaterialLibrary {
  private mats: ShadeMaterials;
  private ghost: THREE.Material;
  private shared = { uTime: { value: 0 } };
  private edges = new Map<THREE.Mesh, THREE.LineSegments>();
  private edgeGroup = new THREE.Group();
  private disaster: Array<THREE.Material> = [];

  paint = PAINTS[0].color;
  finish: FinishId = 'cinematic';
  lightsOn = true;

  constructor() {
    this.mats = {
      surface: this.makeSurface(),
      xray: this.makeXray(),
      blueprint: this.makeBlueprint(),
      hologram: this.makeHologram()
    };
    this.ghost = new THREE.MeshBasicMaterial({
      color: 0x121a24,
      transparent: true,
      opacity: 0.13,
      depthWrite: false,
      side: THREE.DoubleSide
    });
  }

  /** 蓝图线框挂在场景里（作为 vehicle root 的子节点） */
  get edgeRoot() {
    return this.edgeGroup;
  }

  private lit(color: number, intensity: number) {
    return new THREE.MeshStandardMaterial({
      color: 0x0b0f14,
      emissive: new THREE.Color(color),
      emissiveIntensity: intensity,
      roughness: 0.35,
      metalness: 0.1
    });
  }

  private makeSurface(): Record<Role, THREE.Material> {
    const m: Record<string, THREE.Material> = {};
    m.paint = new THREE.MeshPhysicalMaterial({
      color: this.paint,
      metalness: 0.62,
      roughness: 0.2,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
      envMapIntensity: 1.15,
      side: THREE.DoubleSide
    });
    m.carbon = new THREE.MeshStandardMaterial({
      color: 0x11141a,
      metalness: 0.48,
      roughness: 0.38,
      envMapIntensity: 1.0,
      side: THREE.DoubleSide
    });
    m.glass = new THREE.MeshPhysicalMaterial({
      color: 0x9fd6e8,
      metalness: 0.0,
      roughness: 0.06,
      transparent: true,
      opacity: 0.24,
      envMapIntensity: 1.6,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    m.light = this.lit(0xbfefff, 1.5);
    m.tail = this.lit(0xff4a4a, 0.85);
    m.metal = new THREE.MeshStandardMaterial({ color: 0xb9c3cd, metalness: 1, roughness: 0.26, envMapIntensity: 1.2 });
    m.rubber = new THREE.MeshStandardMaterial({ color: 0x0d0f12, metalness: 0.05, roughness: 0.86 });
    m.interior = new THREE.MeshStandardMaterial({ color: 0x1b212a, metalness: 0.15, roughness: 0.72, side: THREE.DoubleSide });
    m.brake = new THREE.MeshStandardMaterial({ color: 0x7f868e, metalness: 0.92, roughness: 0.4 });
    m.accent = this.lit(0x35e8ff, 0.7);
    return m as Record<Role, THREE.Material>;
  }

  private makeXray(): Record<Role, THREE.Material> {
    const mk = (c: number) =>
      holoMat(c, 0xffffff, 0.34, 0.35, this.shared);
    const m: Record<string, THREE.Material> = {};
    (Object.keys(CATEGORIES) as CategoryId[]).forEach(() => void 0);
    m.paint = mk(0x5fd8ff);
    m.carbon = mk(0x7cff9e);
    m.glass = mk(0xa9c8ff);
    m.light = mk(0xffe066);
    m.tail = mk(0xff5a5a);
    m.metal = mk(0xbfe6ff);
    m.rubber = mk(0xff79b0);
    m.interior = mk(0x5fd8ff);
    m.brake = mk(0xff79b0);
    m.accent = mk(0xffe066);
    return m as Record<Role, THREE.Material>;
  }

  private makeBlueprint(): Record<Role, THREE.Material> {
    const base = new THREE.MeshBasicMaterial({ color: 0x0a1428, side: THREE.DoubleSide });
    return {
      paint: base,
      carbon: base,
      glass: base,
      light: base,
      tail: base,
      metal: base,
      rubber: base,
      interior: base,
      brake: base,
      accent: base
    };
  }

  private makeHologram(): Record<Role, THREE.Material> {
    const m: Record<string, THREE.Material> = {};
    m.paint = holoMat(0x1ad4ff, 0xb06cff, 0.55, 0.9, this.shared);
    m.carbon = holoMat(0x35e8ff, 0x7af0d0, 0.5, 0.7, this.shared);
    m.glass = holoMat(0x9fe8ff, 0xffffff, 0.34, 0.5, this.shared);
    m.light = holoMat(0xffe066, 0xffffff, 0.75, 1.1, this.shared);
    m.tail = holoMat(0xff6a6a, 0xffffff, 0.65, 0.9, this.shared);
    m.metal = holoMat(0x8fe6ff, 0xffffff, 0.52, 0.8, this.shared);
    m.rubber = holoMat(0x2fa8ff, 0x6ad0ff, 0.44, 0.5, this.shared);
    m.interior = holoMat(0x35e8ff, 0xb06cff, 0.46, 0.7, this.shared);
    m.brake = holoMat(0xff9ecb, 0xffffff, 0.5, 0.6, this.shared);
    m.accent = holoMat(0xffe066, 0xffffff, 0.8, 1.0, this.shared);
    return m as Record<Role, THREE.Material>;
  }

  setPaint(color: number) {
    this.paint = color;
    (this.mats.surface.paint as THREE.MeshPhysicalMaterial).color.setHex(color);
  }

  setLights(on: boolean) {
    this.lightsOn = on;
    const s = this.mats.surface;
    (s.light as THREE.MeshStandardMaterial).emissiveIntensity = on ? 1.7 : 0.1;
    (s.tail as THREE.MeshStandardMaterial).emissiveIntensity = on ? 1.0 : 0.12;
    (s.accent as THREE.MeshStandardMaterial).emissiveIntensity = on ? 0.8 : 0.22;
    for (const key of Object.keys(this.mats.hologram)) {
      const mm = this.mats.hologram[key as Role] as THREE.ShaderMaterial;
      if (typeof mm.userData.baseOpacity !== 'number') mm.userData.baseOpacity = mm.uniforms.uOpacity.value;
      mm.uniforms.uOpacity.value = mm.userData.baseOpacity * (on ? 1 : 0.55);
    }
  }

  setFinish(f: FinishId) {
    this.finish = f;
    const s = this.mats.surface;
    const k = f === 'cyber' ? 1.5 : 1.0;
    (s.paint as THREE.MeshPhysicalMaterial).envMapIntensity = 1.15 * k;
    (s.carbon as THREE.MeshStandardMaterial).envMapIntensity = 1.0 * k;
    (s.metal as THREE.MeshStandardMaterial).envMapIntensity = 1.2 * k;
    (s.paint as THREE.MeshPhysicalMaterial).roughness = f === 'cyber' ? 0.15 : 0.22;
  }

  setEnv(env: THREE.Texture | null) {
    const s = this.mats.surface;
    for (const key of Object.keys(s)) {
      const mm = s[key as Role] as THREE.MeshStandardMaterial;
      if ('envMap' in mm) {
        mm.envMap = env;
        mm.needsUpdate = true;
      }
    }
  }

  update(t: number) {
    this.shared.uTime.value = t;
  }

  /** 应用着色模式到整车（支持系统隔离：非选中部件转暗） */
  apply(root: THREE.Object3D, shade: ShadeId, opts: { edges: boolean; isolate: boolean; selected: string | null }) {
    const table = this.mats[shade];
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      const role = (mesh.userData?.role as Role | undefined) ?? undefined;
      if (!role || !mesh.isMesh) return;
      const pid = mesh.userData.partId as string | undefined;
      const dim = opts.isolate && !!opts.selected && pid !== opts.selected;
      mesh.material = dim ? this.ghost : table[role];
      mesh.renderOrder = shade === 'surface' ? 0 : dim ? 1 : 2;
    });
    this.syncEdges(root, shade === 'blueprint' && opts.edges);
  }

  private syncEdges(root: THREE.Object3D, on: boolean) {
    if (on) {
      root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        if (this.edges.has(mesh)) return;
        const eg = new THREE.EdgesGeometry(mesh.geometry, 24);
        const ls = new THREE.LineSegments(
          eg,
          new THREE.LineBasicMaterial({ color: 0x8fdcff, transparent: true, opacity: 0.42 })
        );
        ls.userData.follow = mesh;
        this.edges.set(mesh, ls);
        this.edgeGroup.add(ls);
      });
    }
    this.edgeGroup.visible = on;
    if (on) {
      // 同步变换（拆解/机械动作会移动部件）
      for (const ls of this.edges.values()) {
        const src = ls.userData.follow as THREE.Mesh;
        src.updateWorldMatrix(true, false);
        ls.matrix.copy(src.matrixWorld);
        ls.matrixAutoUpdate = false;
        ls.matrixWorldNeedsUpdate = true;
      }
    }
  }

  dispose() {
    this.disaster.forEach((m) => m.dispose());
  }
}
