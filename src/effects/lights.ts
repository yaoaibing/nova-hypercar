import * as THREE from 'three';

/** 前大灯体积光锥：加法混合 + 距离/边缘衰减 */
const VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vPos;
  void main() {
    vUv = uv;
    vPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vPos;
  void main() {
    // vUv.y: 0 在锥尖，1 在锥底（远端）
    float along = 1.0 - vUv.y;
    float fade = pow(1.0 - along, 2.4);
    float edge = sin(vUv.x * 3.14159);
    float flick = 0.97 + 0.03 * sin(uTime * 9.0 + vUv.x * 20.0);
    float a = uOpacity * fade * (0.35 + 0.65 * edge) * flick;
    gl_FragColor = vec4(uColor * (1.0 + fade * 0.6), a);
  }
`;

export interface VolumetricLights {
  root: THREE.Group;
  /** beams=true 时启用真实前照灯（仅夜景需要，展厅不开避免过曝） */
  setEnabled(on: boolean, beams?: boolean): void;
  update(t: number): void;
  setBrake(k: number): void;
  dispose(): void;
}

export function createVolumetricLights(): VolumetricLights {
  const root = new THREE.Group();
  const geo = new THREE.ConeGeometry(1.0, 5.4, 20, 1, true);
  geo.translate(0, -2.7, 0); // 锥尖在原点
  geo.rotateX(Math.PI / 2); // 指向 -z（车头方向）

  const mats: THREE.ShaderMaterial[] = [];
  for (const x of [-0.5, 0.5]) {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(0xcfeaff) },
        uOpacity: { value: 0.095 },
        uTime: { value: 0 }
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, 0.62, -2.2);
    m.rotation.x = -0.06;
    root.add(m);
    mats.push(mat);
  }

  // 真实前照灯：夜景里必须靠它照亮路面，否则座舱看出去是一片黑
  const beams: THREE.SpotLight[] = [];
  for (const x of [-0.5, 0.5]) {
    const sp = new THREE.SpotLight(0xe8f4ff, 380, 74, 0.38, 0.55, 1.05);
    sp.position.set(x, 0.62, -2.12);
    sp.target.position.set(x * 0.5, 0.05, -26);
    root.add(sp, sp.target);
    beams.push(sp);
  }

  // 尾灯光晕
  const glowC = document.createElement('canvas');
  glowC.width = glowC.height = 128;
  const g = glowC.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,80,80,1)');
  grad.addColorStop(0.4, 'rgba(255,40,40,0.35)');
  grad.addColorStop(1, 'rgba(255,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(glowC);
  const tailMat = new THREE.SpriteMaterial({
    map: tex,
    color: 0xff4d4d,
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const tail = new THREE.Sprite(tailMat);
  tail.scale.set(2.6, 0.7, 1);
  tail.position.set(0, 0.74, 2.36);
  root.add(tail);

  let enabled = true;
  let beamsOn = false;
  let brake = 0;

  return {
    root,
    setEnabled(on: boolean, withBeams = false) {
      enabled = on;
      beamsOn = withBeams;
      root.visible = on;
      for (const s of beams) s.visible = on && withBeams;
    },
    update(t: number) {
      for (const m of mats) m.uniforms.uTime.value = t;
      tailMat.opacity = enabled ? 0.28 + brake * 0.5 : 0;
      tail.scale.set(2.6 + brake * 0.4, 0.7 + brake * 0.2, 1);
    },
    setBrake(k: number) {
      brake = k;
      for (const m of mats) m.uniforms.uOpacity.value = 0.095 + k * 0.03;
    },
    dispose() {
      geo.dispose();
      mats.forEach((m) => m.dispose());
      tex.dispose();
      tailMat.dispose();
    }
  };
}
