import * as THREE from 'three';
import type { QualityId } from '../core/state';
import { SceneCtx, gradientTexture, sharedGlow } from './showroom';

/** 全息实验室：旋转环 + 粒子云 + 扫描面 */
export function createLab(): SceneCtx {
  const root = new THREE.Group();
  const disposables: Array<{ dispose(): void }> = [];
  const track = <T extends { dispose(): void }>(x: T) => {
    disposables.push(x);
    return x;
  };

  // 平台
  const platGeo = track(new THREE.CylinderGeometry(3.6, 3.8, 0.14, 64));
  const platMat = track(new THREE.MeshStandardMaterial({ color: 0x0d1420, metalness: 0.7, roughness: 0.35 }));
  const plat = new THREE.Mesh(platGeo, platMat);
  plat.position.y = 0.07;
  root.add(plat);

  const floorGeo = track(new THREE.CircleGeometry(12, 64));
  const floorMat = track(new THREE.MeshStandardMaterial({ color: 0x080c14, metalness: 0.5, roughness: 0.55 }));
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  root.add(floor);

  // 旋转环
  const rings: THREE.Mesh[] = [];
  const mkRing = (r: number, tube: number, y: number, color: number, op: number) => {
    const g = track(new THREE.TorusGeometry(r, tube, 8, 90));
    const m = track(
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    const mesh = new THREE.Mesh(g, m);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.y = y;
    root.add(mesh);
    rings.push(mesh);
    return mesh;
  };
  mkRing(3.9, 0.016, 0.16, 0x35e8ff, 0.8);
  const r2 = mkRing(2.6, 0.02, 1.5, 0xb06cff, 0.5);
  const r3 = mkRing(4.6, 0.014, 2.6, 0x35e8ff, 0.35);

  // 竖向光柱
  const beamGeo = track(new THREE.CylinderGeometry(3.2, 3.6, 6, 40, 1, true));
  const beamMat = track(
    new THREE.MeshBasicMaterial({
      color: 0x2ad4ff,
      transparent: true,
      opacity: 0.05,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.position.y = 3;
  root.add(beam);

  // 粒子云
  const COUNT = 4200;
  const pos = new Float32Array(COUNT * 3);
  const col = new Float32Array(COUNT * 3);
  const seed = new Float32Array(COUNT);
  const cA = new THREE.Color(0x35e8ff);
  const cB = new THREE.Color(0xb06cff);
  for (let i = 0; i < COUNT; i++) {
    const r = 2.2 + Math.random() * 5.4;
    const a = Math.random() * Math.PI * 2;
    const y = Math.random() * 5.2 - 0.4;
    pos[i * 3] = Math.cos(a) * r;
    pos[i * 3 + 1] = y;
    pos[i * 3 + 2] = Math.sin(a) * r;
    const c = Math.random() < 0.55 ? cA : cB;
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
    seed[i] = Math.random();
  }
  const pg = track(new THREE.BufferGeometry());
  pg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  pg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  pg.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1));
  const pmat = track(
    new THREE.PointsMaterial({
      size: 0.035,
      vertexColors: true,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true
    })
  );
  const points = new THREE.Points(pg, pmat);
  root.add(points);

  // 扫描面
  const scanGeo = track(new THREE.CircleGeometry(3.5, 48));
  const scanMat = track(
    new THREE.MeshBasicMaterial({
      color: 0x7af0ff,
      transparent: true,
      opacity: 0.14,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  const scan = new THREE.Mesh(scanGeo, scanMat);
  scan.rotation.x = -Math.PI / 2;
  root.add(scan);

  const wallGeo = track(new THREE.CylinderGeometry(15, 15, 14, 40, 1, true));
  const wallMat = track(new THREE.MeshBasicMaterial({ map: track(gradientTexture('#120a24', '#03050a')), side: THREE.BackSide, fog: false }));
  const wall = new THREE.Mesh(wallGeo, wallMat);
  wall.position.y = 5.6;
  root.add(wall);

  root.add(new THREE.AmbientLight(0x7f93b8, 0.18));
  const key = new THREE.DirectionalLight(0xcfe9ff, 0.9);
  key.position.set(3.5, 5.5, 4.5);
  root.add(key);
  const p1 = new THREE.PointLight(0x35e8ff, 22, 14, 1.5);
  p1.position.set(-3.4, 2.4, -2.6);
  root.add(p1);
  const p2 = new THREE.PointLight(0xb06cff, 18, 14, 1.5);
  p2.position.set(3.4, 1.9, 3);
  root.add(p2);

  const base = pos.slice();

  return {
    id: 'lab',
    root,
    env: 'lab',
    exposure: 1.0,
    cam: { pos: [5.2, 2.4, 6.0], target: [0, 0.8, 0] },
    update(dt, t) {
      r2.rotation.z += dt * 0.25;
      r3.rotation.z -= dt * 0.16;
      rings[0].rotation.z += dt * 0.08;
      beamMat.opacity = 0.045 + Math.sin(t * 0.7) * 0.012;
      scan.position.y = 0.2 + ((t * 0.55) % 3.2);
      scanMat.opacity = 0.16 * (1 - Math.abs(scan.position.y - 1.8) / 2.4);

      const arr = pg.attributes.position as THREE.BufferAttribute;
      const sarr = pg.attributes.aSeed as THREE.BufferAttribute;
      const n = Math.min(arr.count, Math.floor(COUNT));
      for (let i = 0; i < n; i++) {
        const s = sarr.getX(i);
        arr.setY(i, base[i * 3 + 1] + Math.sin(t * (0.5 + s) + s * 9) * 0.12);
      }
      arr.needsUpdate = true;
      p1.intensity = 22 + Math.sin(t * 1.1) * 2;
      p2.intensity = 18 + Math.sin(t * 0.9 + 2) * 2;
    },
    setQuality(q) {
      const n = q === 'high' ? COUNT : q === 'balanced' ? Math.floor(COUNT * 0.6) : Math.floor(COUNT * 0.3);
      pg.setDrawRange(0, n);
      pmat.size = q === 'low' ? 0.05 : 0.035;
    },
    setWet() {},
    dispose() {
      disposables.forEach((d) => d.dispose());
      void sharedGlow;
    }
  };
}
