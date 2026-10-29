import * as THREE from 'three';

/**
 * 环境反射贴图：程序化生成的房间/棚拍/赛博三种环境，供 PMREM 使用。
 * 车身可读性主要来自这里 —— 环境太亮会把车漆打成一片白。
 */
export type EnvId = 'studio' | 'cyber' | 'lab' | 'night';

function plane(
  mat: THREE.MeshBasicMaterial,
  w: number,
  h: number,
  pos: [number, number, number],
  rot: [number, number, number] = [0, 0, 0]
) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.position.set(...pos);
  m.rotation.set(...rot);
  return m;
}

function buildScene(id: EnvId): THREE.Scene {
  const s = new THREE.Scene();
  const add = (c: number, i: number, w: number, h: number, p: [number, number, number], r?: [number, number, number]) =>
    s.add(plane(new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }), w, h, p, r));

  // 地面
  add(id === 'night' ? 0x05070c : 0x0a0e14, 1, 30, 30, [0, -6, 0], [-Math.PI / 2, 0, 0]);
  // 顶棚
  add(id === 'studio' ? 0x2a3038 : id === 'night' ? 0x090d16 : 0x141a24, 1, 30, 30, [0, 9, 0], [Math.PI / 2, 0, 0]);
  // 四壁
  add(id === 'studio' ? 0x171b21 : 0x0b1018, 1, 30, 16, [0, 1, -12]);
  add(id === 'studio' ? 0x171b21 : 0x0b1018, 1, 30, 16, [0, 1, 12], [0, Math.PI, 0]);
  add(id === 'studio' ? 0x141920 : 0x0a0f17, 1, 30, 16, [-12, 1, 0], [0, Math.PI / 2, 0]);
  add(id === 'studio' ? 0x141920 : 0x0a0f17, 1, 30, 16, [12, 1, 0], [0, -Math.PI / 2, 0]);

  if (id === 'studio') {
    // 三条柔和顶光（棚拍感）
    add(0xffffff, 3.2, 14, 1.6, [0, 8.6, -3], [Math.PI / 2, 0, 0]);
    add(0xdff2ff, 2.4, 1.4, 12, [-6.5, 4.2, 0], [0, Math.PI / 2, 0]);
    add(0xffd9e8, 1.8, 1.4, 12, [6.5, 4.2, 0], [0, -Math.PI / 2, 0]);
  } else if (id === 'cyber') {
    add(0x35e8ff, 2.6, 16, 0.9, [0, 6.5, -4], [Math.PI / 2, 0, 0]);
    add(0x35e8ff, 2.0, 0.9, 14, [-8, 3.4, 0], [0, Math.PI / 2, 0]);
    add(0xb06cff, 1.9, 0.9, 14, [8, 3.4, 0], [0, -Math.PI / 2, 0]);
    add(0x8ff5ff, 1.4, 6, 6, [0, -5.6, 0], [-Math.PI / 2, 0, 0]);
  } else if (id === 'lab') {
    add(0x6ff0ff, 2.2, 12, 0.7, [0, 7.2, 0], [Math.PI / 2, 0, 0]);
    add(0xb06cff, 1.6, 0.7, 12, [-7.5, 2.6, 0], [0, Math.PI / 2, 0]);
    add(0x35e8ff, 1.6, 0.7, 12, [7.5, 2.6, 0], [0, -Math.PI / 2, 0]);
  } else {
    // night：整体很暗，但必须有足够的反射能量，否则湿地路面会纯黑
    add(0x0d1219, 1, 30, 30, [0, -6, 0], [-Math.PI / 2, 0, 0]);
    add(0x121a26, 1, 30, 30, [0, 9, 0], [Math.PI / 2, 0, 0]);
    add(0x24405e, 1.4, 8, 0.6, [0, 5.5, -8], [Math.PI / 2, 0, 0]);
    add(0x4a2a72, 1.1, 0.6, 10, [-9, 2.2, -4], [0, Math.PI / 2, 0]);
    add(0x14586e, 1.1, 0.6, 10, [9, 2.2, -4], [0, -Math.PI / 2, 0]);
    add(0x1a2a3c, 0.8, 26, 12, [0, 2, 11], [0, Math.PI, 0]);
  }
  return s;
}

export class Environment {
  private pmrem: THREE.PMREMGenerator;
  private cache = new Map<EnvId, THREE.Texture>();

  constructor(renderer: THREE.WebGLRenderer) {
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.pmrem.compileEquirectangularShader();
  }

  get(id: EnvId): THREE.Texture {
    let t = this.cache.get(id);
    if (!t) {
      const s = buildScene(id);
      const rt = this.pmrem.fromScene(s, 0.03);
      t = rt.texture;
      this.cache.set(id, t);
      s.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.geometry.dispose();
          (m.material as THREE.Material).dispose();
        }
      });
    }
    return t;
  }

  dispose() {
    this.pmrem.dispose();
  }
}
