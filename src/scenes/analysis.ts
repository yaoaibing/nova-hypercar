import * as THREE from 'three';
import type { QualityId } from '../core/state';
import { SceneCtx, gradientTexture } from './showroom';

function labelSprite(text: string, accent = '#5fd8ff'): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, 512, 128);
  g.fillStyle = 'rgba(6,12,20,0.78)';
  g.fillRect(0, 0, 512, 128);
  g.strokeStyle = accent;
  g.lineWidth = 3;
  g.strokeRect(2, 2, 508, 124);
  g.fillStyle = accent;
  g.font = '500 44px "PingFang SC", "Microsoft YaHei", sans-serif';
  g.textBaseline = 'middle';
  g.fillText(text, 26, 66);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sp.scale.set(1.7, 0.42, 1);
  sp.renderOrder = 10;
  return sp;
}

function dataPanel(lines: string[]): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 320;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(5,10,18,0.72)';
  g.fillRect(0, 0, 512, 320);
  g.strokeStyle = 'rgba(95,216,255,0.55)';
  g.lineWidth = 2;
  g.strokeRect(3, 3, 506, 314);
  g.fillStyle = '#5fd8ff';
  g.font = '600 34px "PingFang SC", sans-serif';
  g.fillText('ENGINEERING DATA', 24, 52);
  g.fillStyle = '#cfe6f5';
  g.font = '400 28px "PingFang SC", sans-serif';
  lines.forEach((l, i) => g.fillText(l, 24, 108 + i * 44));
  for (let i = 0; i < 4; i++) {
    g.fillStyle = 'rgba(95,216,255,0.18)';
    g.fillRect(24, 128 + i * 44, 464, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(2.2, 1.375),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false })
  );
  return m;
}

/** 工程分析：网格地面 + 数据面板 + 部件标注引线 */
export function createAnalysis(): SceneCtx {
  const root = new THREE.Group();
  const disposables: Array<{ dispose(): void }> = [];
  const track = <T extends { dispose(): void }>(x: T) => {
    disposables.push(x);
    return x;
  };

  const floorGeo = track(new THREE.PlaneGeometry(40, 40));
  const floorMat = track(new THREE.MeshStandardMaterial({ color: 0x070b12, metalness: 0.3, roughness: 0.8 }));
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  root.add(floor);

  const grid = new THREE.GridHelper(40, 80, 0x2a7fa0, 0x14364a);
  grid.position.y = 0.004;
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.5;
  root.add(grid);
  disposables.push(grid.material as THREE.Material, grid.geometry);

  const wallGeo = track(new THREE.CylinderGeometry(16, 16, 14, 40, 1, true));
  const wallMat = track(new THREE.MeshBasicMaterial({ map: track(gradientTexture('#0a1220', '#03060b')), side: THREE.BackSide, fog: false }));
  const wall = new THREE.Mesh(wallGeo, wallMat);
  wall.position.y = 5.6;
  root.add(wall);

  // 灯光：冷白主光 + 青色补光，整体偏工程蓝
  root.add(new THREE.AmbientLight(0x8fa8bd, 0.2));
  const key = new THREE.DirectionalLight(0xdfefff, 1.35);
  key.position.set(4, 6, 5);
  root.add(key);
  const rim = new THREE.DirectionalLight(0x35e8ff, 0.55);
  rim.position.set(-5, 2.4, -4);
  root.add(rim);
  const under = new THREE.PointLight(0x2f9fd0, 8, 12, 1.6);
  under.position.set(0, -0.4, 0);
  root.add(under);

  // 数据面板
  const p1 = dataPanel([
    '整车质量  1,385 kg',
    '前后配重  42 : 58',
    '风阻系数  0.32 Cd',
    '最大下压力  780 kg'
  ]);
  p1.position.set(-3.6, 1.6, 1.4);
  p1.rotation.y = 0.5;
  root.add(p1);
  const p2 = dataPanel([
    '功率  1,063 ps',
    '扭矩  930 N·m',
    '0-100  2.3 s',
    '极速  352 km/h'
  ]);
  p2.position.set(3.6, 1.6, 1.4);
  p2.rotation.y = -0.5;
  root.add(p2);
  disposables.push((p1.material as THREE.MeshBasicMaterial).map as THREE.Texture, p1.material as THREE.Material, p1.geometry);
  disposables.push((p2.material as THREE.MeshBasicMaterial).map as THREE.Texture, p2.material as THREE.Material, p2.geometry);

  // 标注（选中部件时显示）
  const labelRoot = new THREE.Group();
  root.add(labelRoot);
  let sprite: THREE.Sprite | null = null;
  const lineGeo = track(new THREE.BufferGeometry());
  lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
  const line = new THREE.Line(lineGeo, track(new THREE.LineBasicMaterial({ color: 0x5fd8ff, transparent: true, opacity: 0.7 })));
  line.renderOrder = 9;
  labelRoot.add(line);
  labelRoot.visible = false;

  const api = {
    setLabel(pos: THREE.Vector3 | null, text: string) {
      if (!pos) {
        labelRoot.visible = false;
        return;
      }
      labelRoot.visible = true;
      if (sprite) {
        labelRoot.remove(sprite);
        (sprite.material as THREE.SpriteMaterial).map?.dispose();
        sprite.material.dispose();
      }
      sprite = labelSprite(text);
      const anchor = pos.clone();
      const tip = anchor.clone().add(new THREE.Vector3(0, 1.15, 0));
      sprite.position.copy(tip);
      labelRoot.add(sprite);
      const arr = lineGeo.attributes.position as THREE.BufferAttribute;
      arr.setXYZ(0, anchor.x, anchor.y, anchor.z);
      arr.setXYZ(1, tip.x, tip.y, tip.z);
      arr.needsUpdate = true;
      lineGeo.computeBoundingSphere();
    }
  };

  let spin = 0;
  return {
    id: 'analysis',
    root,
    env: 'lab',
    exposure: 1.0,
    cam: { pos: [5.6, 2.6, 6.4], target: [0, 0.7, 0] },
    update(dt, t) {
      spin += dt;
      p1.position.y = 1.6 + Math.sin(spin * 0.6) * 0.05;
      p2.position.y = 1.6 + Math.sin(spin * 0.6 + 1.1) * 0.05;
      if (sprite) sprite.position.y += Math.sin(t * 1.4) * 0.0009;
      under.intensity = 8 + Math.sin(t * 0.8) * 0.6;
    },
    setQuality(q) {
      key.intensity = q === 'low' ? 1.1 : 1.35;
      (grid.material as THREE.Material).opacity = q === 'low' ? 0.3 : 0.5;
    },
    setWet() {},
    dispose() {
      disposables.forEach((d) => d.dispose());
    },
    ...api
  } as SceneCtx & typeof api;
}
