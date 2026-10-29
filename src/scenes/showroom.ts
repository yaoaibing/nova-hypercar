import * as THREE from 'three';
import type { QualityId } from '../core/state';
import { clamp } from '../core/util';

export interface SceneCtx {
  id: string;
  root: THREE.Group;
  env: 'studio' | 'cyber' | 'lab' | 'night';
  exposure: number;
  fog?: THREE.Fog | THREE.FogExp2 | null;
  cam: { pos: [number, number, number]; target: [number, number, number] };
  /** 工程分析场景：部件标注 */
  setLabel?(pos: THREE.Vector3 | null, text: string): void;
  update(dt: number, t: number): void;
  setQuality(q: QualityId): void;
  setWet(on: boolean): void;
  dispose(): void;
}

/** 生成一张竖向渐变贴图（地面/背景通用） */
export function gradientTexture(top: string, bottom: string, mid?: string): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, top);
  if (mid) grad.addColorStop(0.55, mid);
  grad.addColorStop(1, bottom);
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 径向光晕贴图（灯池、光斑） */
export function glowTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)'): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, inner);
  grad.addColorStop(0.35, inner.replace(/[\d.]+\)$/, '0.45)'));
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export let GLOW_TEX: THREE.Texture | null = null;
export function sharedGlow(): THREE.Texture {
  if (!GLOW_TEX) GLOW_TEX = glowTexture();
  return GLOW_TEX;
}

/**
 * 精密展厅。
 * 灯光策略（对应验收要求）：
 * - 主光负责车身可读性，青色轮廓光 + 少量紫色背光形成层次；
 * - 装饰灯环启动时渐亮后**常亮**，没有呼吸/频闪；
 * - 半镜面地面克制使用，不做雨夜湿地波纹；
 * - 泛光由 PostFX 单独限幅。
 */
export function createShowroom(): SceneCtx {
  const root = new THREE.Group();
  const disposables: Array<{ dispose(): void }> = [];
  const track = <T extends { dispose(): void }>(x: T) => {
    disposables.push(x);
    return x;
  };

  // ---- 地面：克制的半镜面 ----
  const floorGeo = track(new THREE.CircleGeometry(11, 64));
  const floorMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x0b0f16,
      metalness: 0.6,
      roughness: 0.38,
      envMapIntensity: 0.45
    })
  );
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  root.add(floor);

  // 展台
  const podiumGeo = track(new THREE.CylinderGeometry(3.15, 3.35, 0.12, 72));
  const podiumMat = track(new THREE.MeshStandardMaterial({ color: 0x12161f, metalness: 0.6, roughness: 0.4 }));
  const podium = new THREE.Mesh(podiumGeo, podiumMat);
  podium.position.y = 0.06;
  root.add(podium);

  // ---- 装饰灯环（常亮，启动渐亮）----
  const ringMats: THREE.MeshBasicMaterial[] = [];
  const mkRing = (r: number, tube: number, y: number, color: number, opacity: number) => {
    const geo = track(new THREE.TorusGeometry(r, tube, 8, 96));
    const mat = track(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    mat.userData.targetOpacity = opacity;
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = Math.PI / 2;
    m.position.y = y;
    root.add(m);
    ringMats.push(mat);
    return m;
  };
  // 装饰光环保持克制，只做轮廓点缀，不与车身抢亮度
  mkRing(3.42, 0.022, 0.13, 0x35e8ff, 0.55);
  mkRing(2.9, 0.014, 0.13, 0x9ff5ff, 0.32);
  mkRing(4.6, 0.03, 3.05, 0x35e8ff, 0.28);
  mkRing(4.6, 0.018, 3.35, 0xb06cff, 0.2);

  // 地面光池（弱，不抢主体）
  const poolGeo = track(new THREE.CircleGeometry(4.4, 48));
  const poolTex = track(sharedGlow());
  const poolMat = track(
    new THREE.MeshBasicMaterial({
      map: poolTex,
      color: 0x14495e,
      transparent: true,
      opacity: 0.09,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  const pool = new THREE.Mesh(poolGeo, poolMat);
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = 0.14;
  pool.scale.set(1, 1, 1);
  root.add(pool);

  // ---- 背景墙 ----
  const wallGeo = track(new THREE.CylinderGeometry(15, 15, 14, 48, 1, true));
  const wallTex = track(gradientTexture('#152036', '#070b12', '#0c1424'));
  const wallMat = track(new THREE.MeshBasicMaterial({ map: wallTex, side: THREE.BackSide, fog: false }));
  const wall = new THREE.Mesh(wallGeo, wallMat);
  wall.position.y = 5.4;
  root.add(wall);

  // ---- 灯光 ----
  const ambient = new THREE.AmbientLight(0x9fb6c8, 0.16);
  root.add(ambient);

  // 主光：白，负责车身形体与漆面
  const key = new THREE.SpotLight(0xffffff, 46, 26, 0.62, 0.55, 1.25);
  key.position.set(3.4, 6.4, 4.6);
  key.target.position.set(0, 0.7, 0);
  root.add(key, key.target);

  // 青色轮廓光（左后）
  const rimC = new THREE.SpotLight(0x4fe9ff, 26, 24, 0.7, 0.7, 1.3);
  rimC.position.set(-5.4, 3.6, -4.4);
  rimC.target.position.set(0, 0.75, 0);
  root.add(rimC, rimC.target);

  // 紫色背光（右后，量要少）
  const rimM = new THREE.SpotLight(0xb06cff, 14, 22, 0.75, 0.8, 1.35);
  rimM.position.set(5.2, 2.6, -5.2);
  rimM.target.position.set(0, 0.7, 0);
  root.add(rimM, rimM.target);

  // 前部补光，避免车头死黑
  const fill = new THREE.DirectionalLight(0xcfe6ff, 0.35);
  fill.position.set(-2.5, 2.2, 6.5);
  root.add(fill);

  let boot = 0;
  const tmp = new THREE.Vector3();

  return {
    id: 'showroom',
    root,
    env: 'studio',
    exposure: 1.08,
    cam: { pos: [6.1, 2.25, 7.2], target: [0, 0.72, 0] },
    update(dt, t) {
      // 启动渐亮：1.2 秒到位后保持常亮，不做呼吸
      boot = Math.min(1, boot + dt / 1.2);
      const g = clamp(boot);
      for (const m of ringMats) m.opacity = (m.userData.targetOpacity as number) * g;
      poolMat.opacity = 0.09 * g;
      // 极缓慢的展台呼吸被刻意去掉：这里只有常亮值
      void t;
      void tmp;
    },
    setQuality(q) {
      key.intensity = q === 'high' ? 46 : q === 'balanced' ? 38 : 30;
      rimC.intensity = q === 'high' ? 26 : 20;
      rimM.intensity = q === 'high' ? 14 : 11;
      floorMat.envMapIntensity = q === 'low' ? 0.4 : 0.55;
    },
    setWet() {
      /* 展厅不使用雨夜湿地参数 */
    },
    dispose() {
      disposables.forEach((d) => d.dispose());
    }
  };
}
