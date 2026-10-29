import * as THREE from 'three';
import type { QualityId } from '../core/state';
import { sharedGlow } from '../scenes/showroom';

/**
 * 循环高速公路：跑步机式循环（车停在原点，路面按行驶距离后移）。
 * 段数固定，只更新每个段 Group 的 z，接缝靠段长整除保证连续。
 */

const SEG_LEN = 60;
const SEGS = 8;
const TOTAL = SEG_LEN * SEGS;
const ROAD_W = 14;
const CITY_TOTAL = 900;

const wrap = (z: number, total: number) => (((z % total) + total) % total) - total / 2;

export interface Road {
  root: THREE.Group;
  update(distance: number): void;
  setWet(on: boolean): void;
  setQuality(q: QualityId): void;
  dispose(): void;
}

function asphaltTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#15181f';
  g.fillRect(0, 0, 256, 256);
  const img = g.getImageData(0, 0, 256, 256);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 26;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n * 1.1;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 8);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function cityTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#080c14';
  g.fillRect(0, 0, 64, 128);
  for (let y = 0; y < 128; y += 8) {
    for (let x = 0; x < 64; x += 8) {
      if (Math.random() < 0.35) {
        g.fillStyle = Math.random() < 0.5 ? 'rgba(90,200,255,0.55)' : 'rgba(190,120,255,0.45)';
        g.fillRect(x + 2, y + 2, 4, 4);
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createRoad(quality: QualityId): Road {
  const root = new THREE.Group();
  const disposables: Array<{ dispose(): void }> = [];
  const track = <T extends { dispose(): void }>(x: T) => {
    disposables.push(x);
    return x;
  };

  const asphalt = track(asphaltTexture());
  const glow = sharedGlow();

  const roadMat = track(
    new THREE.MeshStandardMaterial({
      map: asphalt,
      color: 0x22262e,
      // 湿地靠低 roughness + 中等 metalness：metalness 过高会吃掉全部漫反射，路面会变纯黑
      roughness: 0.3,
      metalness: 0.42,
      envMapIntensity: 1.0,
      // 夜景里给路面一个极弱的底色，避免远处完全没有可读性
      emissive: new THREE.Color(0x0a0e14),
      emissiveIntensity: 1
    })
  );
  const laneMat = track(new THREE.MeshBasicMaterial({ color: 0xe6eef6, transparent: true, opacity: 0.7 }));
  const railMat = track(new THREE.MeshStandardMaterial({ color: 0x232a36, metalness: 0.85, roughness: 0.4 }));
  const railGlowMat = track(new THREE.MeshBasicMaterial({ color: 0x35e8ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
  const poleMat = track(new THREE.MeshStandardMaterial({ color: 0x1b212b, metalness: 0.7, roughness: 0.5 }));
  const lampMat = track(new THREE.MeshBasicMaterial({ color: 0xfff0c4 }));
  const neonMat = track(new THREE.MeshBasicMaterial({ color: 0xb06cff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  const poolMat = track(
    new THREE.MeshBasicMaterial({ map: glow, color: 0xffdc9a, transparent: true, opacity: 0.46, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  const cityTex = track(cityTexture());
  const cityMat = track(new THREE.MeshBasicMaterial({ map: cityTex, color: 0x8899bb, fog: true }));

  const roadGeo = track(new THREE.PlaneGeometry(ROAD_W, SEG_LEN));
  const railGeo = track(new THREE.BoxGeometry(0.14, 0.95, SEG_LEN));
  const railTopGeo = track(new THREE.BoxGeometry(0.16, 0.05, SEG_LEN));
  const dashGeo = track(new THREE.PlaneGeometry(0.18, 3.4));
  const edgeGeo = track(new THREE.PlaneGeometry(0.22, SEG_LEN));
  const poleGeo = track(new THREE.BoxGeometry(0.16, 6, 0.16));
  const armGeo = track(new THREE.BoxGeometry(2.2, 0.14, 0.14));
  const lampGeo = track(new THREE.BoxGeometry(0.7, 0.16, 0.34));
  const poolGeo = track(new THREE.CircleGeometry(4.2, 24));

  const segs: Array<{ group: THREE.Group; base: number }> = [];

  for (let i = 0; i < SEGS; i++) {
    const g = new THREE.Group();

    const road = new THREE.Mesh(roadGeo, roadMat);
    road.rotation.x = -Math.PI / 2;
    g.add(road);

    for (const s of [-1, 1]) {
      const rail = new THREE.Mesh(railGeo, railMat);
      rail.position.set(s * (ROAD_W / 2 + 0.35), 0.48, 0);
      g.add(rail);
      const top = new THREE.Mesh(railTopGeo, railGlowMat);
      top.position.set(s * (ROAD_W / 2 + 0.35), 0.98, 0);
      g.add(top);

      const edge = new THREE.Mesh(edgeGeo, laneMat);
      edge.rotation.x = -Math.PI / 2;
      edge.position.set(s * (ROAD_W / 2 - 0.5), 0.012, 0);
      g.add(edge);
    }

    // 车道虚线（3 车道 → 2 条分隔线）
    for (const x of [-ROAD_W / 6, ROAD_W / 6]) {
      for (let d = -SEG_LEN / 2 + 4.5; d < SEG_LEN / 2; d += 9) {
        const dash = new THREE.Mesh(dashGeo, laneMat);
        dash.rotation.x = -Math.PI / 2;
        dash.position.set(x, 0.012, d);
        g.add(dash);
      }
    }

    // 路灯：每段 2 根（左右交替，间隔 30m）
    for (let k = 0; k < 2; k++) {
      const s = k % 2 === 0 ? -1 : 1;
      const z = -SEG_LEN / 2 + 15 + k * 30;
      const lg = new THREE.Group();
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.y = 3;
      lg.add(pole);
      const arm = new THREE.Mesh(armGeo, poleMat);
      arm.position.set(-s * 1.1, 5.9, 0);
      lg.add(arm);
      const lamp = new THREE.Mesh(lampGeo, lampMat);
      lamp.position.set(-s * 2.0, 5.8, 0);
      lg.add(lamp);
      const halo = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: glow, color: 0xffe0a8, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      halo.scale.set(3.4, 3.4, 1);
      halo.position.set(-s * 2.0, 5.8, 0);
      lg.add(halo);
      const pool = new THREE.Mesh(poolGeo, poolMat);
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(-s * 2.0, 0.02, 0);
      pool.scale.set(1, 1.5, 1);
      lg.add(pool);
      lg.position.set(s * (ROAD_W / 2 + 1.2), 0, z);
      g.add(lg);
    }

    segs.push({ group: g, base: -TOTAL / 2 + SEG_LEN / 2 + i * SEG_LEN });
    root.add(g);
  }

  // 霓虹灯门（周期与路面一致，保证视觉节奏连续）
  const gates: Array<{ group: THREE.Group; base: number }> = [];
  for (let i = 0; i < 3; i++) {
    const g = new THREE.Group();
    for (const s of [-1, 1]) {
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.5, 7.4, 0.5), poleMat);
      col.position.set(s * (ROAD_W / 2 + 0.8), 3.7, 0);
      g.add(col);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(ROAD_W + 2.4, 0.9, 0.5), poleMat);
    beam.position.y = 7.4;
    g.add(beam);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(ROAD_W + 1.6, 0.2, 0.08), neonMat);
    strip.position.set(0, 7.05, 0.28);
    g.add(strip);
    const strip2 = new THREE.Mesh(new THREE.BoxGeometry(ROAD_W + 1.6, 0.12, 0.08), neonMat);
    strip2.position.set(0, 6.6, 0.28);
    strip2.scale.set(1, 0.7, 1);
    g.add(strip2);
    gates.push({ group: g, base: -TOTAL / 2 + (i * TOTAL) / 3 });
    root.add(g);
  }

  // 城市剪影（远景，带视差）
  const cityL = new THREE.Group();
  const cityR = new THREE.Group();
  const cityGeo = track(new THREE.BoxGeometry(1, 1, 1));
  for (let i = 0; i < 34; i++) {
    for (const [grp, side] of [
      [cityL, -1],
      [cityR, 1]
    ] as Array<[THREE.Group, number]>) {
      const h = 8 + Math.random() * 34;
      const w = 4 + Math.random() * 7;
      const b = new THREE.Mesh(cityGeo, cityMat);
      b.scale.set(w, h, w * 0.8);
      b.position.set(side * (22 + Math.random() * 26), h / 2, -CITY_TOTAL / 2 + Math.random() * CITY_TOTAL);
      grp.add(b);
    }
  }
  root.add(cityL, cityR);

  let wet = true;
  const setWet = (on: boolean) => {
    wet = on;
    roadMat.roughness = on ? 0.28 : 0.7;
    roadMat.metalness = on ? 0.45 : 0.18;
    roadMat.envMapIntensity = on ? 1.15 : 0.4;
    poolMat.opacity = on ? 0.46 : 0.16;
    laneMat.opacity = on ? 0.7 : 0.8;
  };
  setWet(wet);

  return {
    root,
    update(distance: number) {
      for (const s of segs) s.group.position.z = wrap(s.base + distance, TOTAL);
      for (const g of gates) g.group.position.z = wrap(g.base + distance, TOTAL);
      cityL.position.z = wrap(distance * 0.32, CITY_TOTAL);
      cityR.position.z = wrap(distance * 0.32, CITY_TOTAL);
    },
    setWet,
    setQuality(q) {
      const vis = q !== 'low';
      cityL.visible = vis;
      cityR.visible = vis;
      railGlowMat.opacity = q === 'low' ? 0.5 : 0.85;
      poolMat.opacity = wet ? (q === 'low' ? 0.3 : 0.46) : 0.16;
    },
    dispose() {
      disposables.forEach((d) => d.dispose());
    }
  };
}

export const ROAD_INFO = { SEG_LEN, SEGS, TOTAL, ROAD_W };
