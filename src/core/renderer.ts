import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export interface View {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  resize(): void;
}

export function createView(canvas: HTMLCanvasElement): View {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
    stencil: false,
    preserveDrawingBuffer: true
  });
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = false;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05070d);

  const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.06, 600);
  camera.position.set(6.4, 2.3, 7.6);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.target.set(0, 0.72, 0);
  controls.minDistance = 2.6;
  controls.maxDistance = 22;
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.minPolarAngle = 0.08;
  controls.rotateSpeed = 0.85;
  controls.zoomSpeed = 0.8;
  controls.panSpeed = 0.6;
  controls.autoRotateSpeed = 0.45;

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);

  return { renderer, scene, camera, controls, resize };
}
