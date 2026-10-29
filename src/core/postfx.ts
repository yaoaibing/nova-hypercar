import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { SceneId, QualityId } from './state';
import type { FinishId } from '../vehicle/materials';

/**
 * 后处理：泛光 + 轻度扫描线/颗粒/暗角。
 * 展厅单独压低 bloom 上限并弱化扫描线，避免静止观察时的闪动感。
 */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uScan: { value: 0.05 },
    uGrain: { value: 0.03 },
    uVignette: { value: 0.42 },
    uChroma: { value: 0.0015 },
    uCyber: { value: 0.0 },
    uRes: { value: new THREE.Vector2(1, 1) }
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uScan, uGrain, uVignette, uChroma, uCyber;
    uniform vec2 uRes;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
    void main() {
      vec2 uv = vUv;
      vec2 off = (uv - 0.5) * uChroma;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + off).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - off).b;

      // 扫描线：极低幅度，静止时不应被察觉
      float sl = sin((uv.y * uRes.y) * 3.14159) * 0.5 + 0.5;
      col *= 1.0 - uScan * sl;

      // 动态颗粒：幅度小、频率低，避免频闪
      float g = hash(uv * uRes + fract(uTime) * 91.7);
      col += (g - 0.5) * uGrain;

      // 暗角
      float d = distance(uv, vec2(0.5));
      col *= 1.0 - uVignette * smoothstep(0.42, 0.92, d);

      // 赛博染色（强赛博模式）
      if (uCyber > 0.001) {
        vec3 tint = vec3(0.72, 1.0, 1.06) * (col.r + col.g + col.b) * 0.34 + col * 0.66;
        col = mix(col, tint, uCyber * 0.55);
      }
      gl_FragColor = vec4(col, 1.0);
    }
  `
};

export class PostFX {
  composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private grade: ShaderPass;
  private renderPass: RenderPass;
  enabled = true;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    const size = renderer.getSize(new THREE.Vector2());
    this.composer = new EffectComposer(renderer);
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.42, 0.6, 0.82);
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
    this.grade.uniforms.uRes.value.set(size.x, size.y);
  }

  setCamera(c: THREE.Camera) {
    this.renderPass.camera = c;
  }

  setSize(w: number, h: number) {
    this.composer.setSize(w, h);
    this.bloom.setSize(w, h);
    this.grade.uniforms.uRes.value.set(w, h);
  }

  /** 按场景 / 画质 / 材质强度设定后处理参数 */
  apply(scene: SceneId, quality: QualityId, finish: FinishId) {
    const cyber = finish === 'cyber' ? 1 : 0;
    const q = quality === 'high' ? 1 : quality === 'balanced' ? 0.72 : 0.45;

    if (scene === 'showroom') {
      // 展厅：泛光上限受控，扫描线/颗粒压到最低
      this.bloom.strength = 0.26 + cyber * 0.1;
      this.bloom.radius = 0.5;
      this.bloom.threshold = 0.88;
      this.grade.uniforms.uScan.value = 0.035;
      this.grade.uniforms.uGrain.value = 0.018;
      this.grade.uniforms.uVignette.value = 0.4;
      this.grade.uniforms.uCyber.value = cyber * 0.5;
    } else if (scene === 'rain') {
      this.bloom.strength = 0.62 + cyber * 0.22;
      this.bloom.radius = 0.72;
      this.bloom.threshold = 0.72;
      this.grade.uniforms.uScan.value = 0.06;
      this.grade.uniforms.uGrain.value = 0.035;
      this.grade.uniforms.uVignette.value = 0.5;
      this.grade.uniforms.uCyber.value = 0.45 + cyber * 0.55;
    } else if (scene === 'lab') {
      this.bloom.strength = 0.5 + cyber * 0.2;
      this.bloom.radius = 0.7;
      this.bloom.threshold = 0.7;
      this.grade.uniforms.uScan.value = 0.09;
      this.grade.uniforms.uGrain.value = 0.03;
      this.grade.uniforms.uVignette.value = 0.46;
      this.grade.uniforms.uCyber.value = 0.6 + cyber * 0.4;
    } else {
      this.bloom.strength = 0.36 + cyber * 0.14;
      this.bloom.radius = 0.6;
      this.bloom.threshold = 0.8;
      this.grade.uniforms.uScan.value = 0.05;
      this.grade.uniforms.uGrain.value = 0.022;
      this.grade.uniforms.uVignette.value = 0.44;
      this.grade.uniforms.uCyber.value = cyber * 0.7;
    }

    this.bloom.enabled = quality !== 'low';
    this.grade.uniforms.uChroma.value = quality === 'low' ? 0 : 0.0015;
    this.enabled = true;
    void q;
  }

  update(t: number) {
    this.grade.uniforms.uTime.value = t;
  }

  render(dt: number) {
    this.composer.render(dt);
  }

  dispose() {
    this.composer.dispose();
  }
}
