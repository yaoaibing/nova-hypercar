import * as THREE from 'three';
import type { QualityId, DriveCam } from '../core/state';
import { createRoad, type Road } from '../driving/road';
import { createRain, type RainFX } from '../effects/weather';
import { SceneCtx, gradientTexture } from './showroom';

export interface RainScene extends SceneCtx {
  road: Road;
  rain: RainFX;
  fog: THREE.FogExp2;
}

/** 赛博雨夜：湿地反射 + 雨丝 + 循环高速路（驾驶时启用） */
export function createRainScene(quality: QualityId): RainScene {
  const root = new THREE.Group();
  const disposables: Array<{ dispose(): void }> = [];
  const track = <T extends { dispose(): void }>(x: T) => {
    disposables.push(x);
    return x;
  };

  const road = createRoad(quality);
  root.add(road.root);

  const rain = createRain(quality);
  root.add(rain.root);

  // 远景地面（路面之外）
  const groundGeo = track(new THREE.PlaneGeometry(400, 900));
  const groundMat = track(new THREE.MeshStandardMaterial({ color: 0x080b11, roughness: 0.5, metalness: 0.5 }));
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.04;
  root.add(ground);

  // 远处广告牌霓虹
  const neonTex = track(gradientTexture('#1a0d2e', '#05070d', '#0d1a2c'));
  const boardGeo = track(new THREE.PlaneGeometry(9, 5));
  for (let i = 0; i < 6; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const mat = track(
      new THREE.MeshBasicMaterial({
        map: neonTex,
        color: i % 3 === 0 ? 0x35e8ff : i % 3 === 1 ? 0xb06cff : 0xff6ec7,
        transparent: true,
        opacity: 0.32,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    const b = new THREE.Mesh(boardGeo, mat);
    b.position.set(side * (16 + Math.random() * 6), 6 + Math.random() * 8, -120 + i * 45);
    b.rotation.y = side * -0.45;
    root.add(b);
  }

  const wallGeo = track(new THREE.CylinderGeometry(120, 120, 60, 24, 1, true));
  const wallMat = track(new THREE.MeshBasicMaterial({ map: track(gradientTexture('#0a1220', '#03050a')), side: THREE.BackSide, fog: false }));
  const wall = new THREE.Mesh(wallGeo, wallMat);
  wall.position.y = 20;
  root.add(wall);

  const fog = new THREE.FogExp2(0x0a1018, 0.009);

  // 灯光：环境压得很低，亮度主要来自车灯与霓虹
  const amb = new THREE.AmbientLight(0x35506e, 0.5);
  root.add(amb);
  const moon = new THREE.DirectionalLight(0x9fc4e8, 0.6);
  moon.position.set(-8, 12, -6);
  root.add(moon);
  const neonFill = new THREE.PointLight(0xb06cff, 12, 26, 1.6);
  neonFill.position.set(6, 3.2, -4);
  root.add(neonFill);
  const neonFill2 = new THREE.PointLight(0x35e8ff, 10, 26, 1.6);
  neonFill2.position.set(-6, 2.6, 3);
  root.add(neonFill2);

  return {
    id: 'rain',
    root,
    env: 'night',
    exposure: 1.22,
    fog,
    cam: { pos: [6.0, 2.1, 6.8], target: [0, 0.7, 0] },
    road,
    rain,
    update(dt, t) {
      rain.update(dt, t, new THREE.Vector3(0, 0.6, 0), 0);
      neonFill.intensity = 12 + Math.sin(t * 1.7) * 1.5;
      neonFill2.intensity = 10 + Math.sin(t * 1.3 + 1.5) * 1.2;
    },
    setQuality(q) {
      road.setQuality(q);
      rain.setQuality(q);
    },
    setWet(on) {
      road.setWet(on);
      groundMat.metalness = on ? 0.6 : 0.2;
      groundMat.roughness = on ? 0.4 : 0.8;
      fog.density = on ? 0.009 : 0.006;
    },
    dispose() {
      disposables.forEach((d) => d.dispose());
      road.dispose();
      rain.dispose();
    }
  };
}
