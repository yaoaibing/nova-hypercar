import * as THREE from 'three';
import { createView, type View } from './core/renderer';
import { Environment } from './core/environment';
import { PostFX } from './core/postfx';
import { State, type SceneId, type QualityId, type DriveCam, type Settings } from './core/state';
import { Timeline } from './core/timeline';
import { clamp, damp, easeInOut } from './core/util';
import { buildVehicle, PART_DEFS, type VehicleModel } from './vehicle/model';
import { MaterialLibrary, PAINTS, type ShadeId, type FinishId } from './vehicle/materials';
import { Actuation } from './vehicle/actuation';
import { createShowroom, type SceneCtx } from './scenes/showroom';
import { createAnalysis } from './scenes/analysis';
import { createLab } from './scenes/lab';
import { createRainScene, type RainScene } from './scenes/rain';
import { createVolumetricLights } from './effects/lights';
import { createExhaust, createSpray, createFlowLines } from './effects/drive';
import { Drive } from './driving/drive';
import { UI } from './ui/ui';

const PIXEL_RATIO: Record<QualityId, number> = { high: 2, balanced: 1.5, low: 1 };

function shadowTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(0,0,0,0.62)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.28)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class App {
  state = new State();
  private view: View;
  private env: Environment;
  private post: PostFX;
  private mats = new MaterialLibrary();
  private model!: VehicleModel;
  private act!: Actuation;
  private scenes!: Record<SceneId, SceneCtx>;
  private rainScene!: RainScene;
  private volume = createVolumetricLights();
  private exhaust = createExhaust();
  private spray = createSpray(520);
  private flow = createFlowLines();
  private drive!: Drive;
  private ui!: UI;
  private timeline: Timeline;

  private clock = new THREE.Clock();
  private t = 0;
  private fpsAcc = 0;
  private fpsCount = 0;
  private fpsEl: HTMLElement;
  private fadeEl: HTMLElement;

  private camLerp = 0;
  private camLerpDur = 0.9;
  private camFrom = new THREE.Vector3();
  private camTo = new THREE.Vector3();
  private tgtFrom = new THREE.Vector3();
  private tgtTo = new THREE.Vector3();

  private savedBeforeDrive: Partial<Settings> | null = null;
  private box = new THREE.Box3();
  private center = new THREE.Vector3();
  private labelTick = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.view = createView(canvas);
    this.env = new Environment(this.view.renderer);
    this.post = new PostFX(this.view.renderer, this.view.scene, this.view.camera);
    this.fpsEl = document.getElementById('fps')!;
    this.fadeEl = document.createElement('div');
    Object.assign(this.fadeEl.style, {
      position: 'absolute',
      inset: '0',
      background: '#04060a',
      opacity: '0',
      pointerEvents: 'none',
      transition: 'opacity .3s ease',
      zIndex: '50'
    });
    document.getElementById('app')!.appendChild(this.fadeEl);

    this.timeline = new Timeline({
      set: (k, v) => this.state.set(k, v as Settings[typeof k]),
      cam: (pos, target, orbit) => {
        this.timeline.camPos = pos;
        this.timeline.camTarget = target;
        this.timeline.orbit = orbit;
      },
      drive: (on, cam) => {
        if (on) {
          if (!this.state.s.driving) this.enterDrive(cam ?? 'chase');
          else if (cam) this.drive.setCam(cam);
        } else if (this.state.s.driving) {
          this.exitDrive();
        }
      },
      autoDrive: (on) => {
        this.drive.autoDrive = on;
      }
    });

    this.build();
    this.bindState();
    this.bindKeys();
    this.applyQuality(this.state.s.quality);
    this.applyScene(this.state.s.scene, true);
    this.applyShade();
    this.exposeNova();
    this.loop();
  }

  /* ---------------- 构建 ---------------- */

  private build() {
    const scene = this.view.scene;

    this.model = buildVehicle();
    this.act = new Actuation(this.model);
    scene.add(this.model.root);

    // 接地阴影
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(5.6, 8.4),
      new THREE.MeshBasicMaterial({
        map: shadowTexture(),
        transparent: true,
        depthWrite: false,
        opacity: 0.9,
        blending: THREE.NormalBlending
      })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.014;
    shadow.renderOrder = -1;
    this.model.root.add(shadow);
    this.model.root.add(this.volume.root);
    this.model.root.add(this.exhaust.root);
    this.model.root.add(this.spray.root);
    this.model.root.add(this.flow.root);
    this.model.root.add(this.mats.edgeRoot);

    this.scenes = {
      showroom: createShowroom(),
      analysis: createAnalysis(),
      lab: createLab(),
      rain: (this.rainScene = createRainScene(this.state.s.quality))
    };
    for (const s of Object.values(this.scenes)) {
      s.root.visible = false;
      scene.add(s.root);
    }

    this.drive = new Drive({
      camera: this.view.camera,
      vehicle: this.model.root,
      actuation: this.act,
      road: this.rainScene.road,
      rain: this.rainScene.rain,
      exhaust: this.exhaust,
      spray: this.spray,
      wet: () => this.state.s.wet,
      onHud: (h) => this.ui?.setHud(h)
    });

    this.ui = new UI(this.state, {
      onScene: (id) => this.state.set('scene', id),
      onShade: (id) => this.state.set('shade', id),
      onQuality: (id) => this.state.set('quality', id),
      onFinish: (id) => this.state.set('finish', id),
      onPaint: (id) => this.state.set('paint', id),
      onToggle: (key) => this.state.toggle(key),
      onExplode: (v) => this.state.set('explode', v),
      onMode: (m) => this.state.set('explodeMode', m),
      onSelect: (id) => this.state.set('selected', id),
      onHome: () => this.home(),
      onDemo: () => this.toggleDemo(),
      onDrive: () => this.enterDrive('chase'),
      onExitDrive: () => this.exitDrive(),
      onCam: (c) => this.drive.setCam(c),
      onPhoto: () => this.state.toggle('photo'),
      onShot: () => this.screenshot()
    });
    this.ui.setDriving(false);
  }

  /* ---------------- 状态响应 ---------------- */

  private bindState() {
    this.state.on('change', ({ key }) => {
      switch (key) {
        case 'scene':
          this.applyScene(this.state.s.scene, false);
          break;
        case 'shade':
          this.applyShade();
          break;
        case 'quality':
          this.applyQuality(this.state.s.quality);
          break;
        case 'finish':
          this.mats.setFinish(this.state.s.finish);
          this.post.apply(this.state.s.scene, this.state.s.quality, this.state.s.finish);
          break;
        case 'paint': {
          const p = PAINTS.find((x) => x.id === this.state.s.paint);
          if (p) this.mats.setPaint(p.color);
          break;
        }
        case 'headlights':
          this.mats.setLights(this.state.s.headlights);
          break;
        case 'wing':
          this.act.setWing(this.state.s.wing);
          break;
        case 'doors':
          this.act.setDoors(this.state.s.doors);
          break;
        case 'flow':
          this.flow.setEnabled(this.state.s.flow);
          break;
        case 'photo':
          this.applyPhoto();
          break;
        case 'isolate':
        case 'selected':
          this.applyShade();
          break;
        case 'wet':
          for (const s of Object.values(this.scenes)) s.setWet(this.state.s.wet);
          break;
        default:
          break;
      }
    });
  }

  private applyScene(id: SceneId, immediate: boolean) {
    for (const [k, s] of Object.entries(this.scenes)) {
      const on = k === id;
      s.root.visible = on;
      if (on) {
        this.view.scene.environment = this.env.get(s.env);
        this.view.scene.fog = s.fog ?? null;
        this.view.renderer.toneMappingExposure = s.exposure;
        this.post.apply(id, this.state.s.quality, this.state.s.finish);
        this.mats.setEnv(this.env.get(s.env));
      }
    }
    const s = this.scenes[id];
    if (immediate) {
      this.view.camera.position.set(...s.cam.pos);
      this.view.controls.target.set(...s.cam.target);
      this.camLerp = 0;
    } else {
      this.camFrom.copy(this.view.camera.position);
      this.camTo.set(...s.cam.pos);
      this.tgtFrom.copy(this.view.controls.target);
      this.tgtTo.set(...s.cam.target);
      this.camLerp = this.camLerpDur;
    }
    // 每帧刷新一次材质（env 变化）
    this.applyShade();
    for (const sc of Object.values(this.scenes)) sc.setWet(this.state.s.wet);
  }

  private applyShade() {
    const s = this.state.s;
    this.mats.apply(this.model.root, s.shade, {
      edges: s.quality !== 'low',
      isolate: s.isolate,
      selected: s.selected
    });
  }

  private applyQuality(q: QualityId) {
    const dpr = Math.min(window.devicePixelRatio || 1, PIXEL_RATIO[q]);
    this.view.renderer.setPixelRatio(dpr);
    this.view.resize();
    const size = this.view.renderer.getSize(new THREE.Vector2());
    this.post.setSize(size.x, size.y);
    this.post.apply(this.state.s.scene, q, this.state.s.finish);
    for (const s of Object.values(this.scenes)) s.setQuality(q);
    this.spray.setQuality(q === 'high' ? 520 : q === 'balanced' ? 320 : 150);
  }

  private applyPhoto() {
    const on = this.state.s.photo;
    document.getElementById('panel-left')!.classList.toggle('hidden', on);
    document.getElementById('panel-right')!.classList.toggle('hidden', on);
    document.getElementById('topbar')!.style.opacity = on ? '0' : '1';
    this.ui.setInfo(on ? '摄影模式：隐藏界面，按 P 退出' : null);
  }

  /* ---------------- 驾驶 ---------------- */

  enterDrive(cam: DriveCam = 'chase') {
    if (this.state.s.driving) return;
    // 进入前：装配归位、关门、整理状态
    this.savedBeforeDrive = {
      scene: this.state.s.scene,
      shade: this.state.s.shade,
      explode: this.state.s.explode,
      explodeMode: this.state.s.explodeMode,
      selected: this.state.s.selected,
      isolate: this.state.s.isolate,
      doors: this.state.s.doors
    };
    this.state.set('explode', 0);
    this.state.set('explodeMode', 'all');
    this.state.set('selected', null);
    this.state.set('isolate', false);
    this.state.set('doors', false);
    this.state.set('wing', true);
    this.state.set('shade', 'surface');
    this.state.set('photo', false);
    if (this.timeline.playing) this.timeline.pause();
    if (this.state.s.scene !== 'rain') this.state.set('scene', 'rain');

    this.drive.setCam(cam);
    this.drive.enter();
    this.state.set('driving', true);
    this.state.set('driveCam', cam);
    this.ui.setDriving(true);
    this.ui.setInfo('驾驶模式：W 加速 / S 刹车 / A·D 转向 / Shift 氮气 / C 视角 / Esc 退出');
  }

  exitDrive() {
    if (!this.state.s.driving) return;
    this.drive.exit();
    this.drive.autoDrive = false;
    this.state.set('driving', false);
    this.ui.setDriving(false);
    this.ui.setInfo(null);
    // 恢复进入前的展示状态
    const p = this.savedBeforeDrive;
    if (p) {
      if (p.scene && p.scene !== this.state.s.scene) this.state.set('scene', p.scene);
      if (p.shade) this.state.set('shade', p.shade);
      if (p.explode !== undefined) this.state.set('explode', p.explode);
      if (p.explodeMode) this.state.set('explodeMode', p.explodeMode);
      this.state.set('selected', p.selected ?? null);
      this.state.set('isolate', !!p.isolate);
      this.state.set('doors', !!p.doors);
    }
    this.savedBeforeDrive = null;
    this.act.steer = 0;
    this.act.distance = 0;
    this.act.pose();
  }

  /* ---------------- 演示 / 复位 / 截图 ---------------- */

  toggleDemo() {
    if (this.state.s.driving) {
      this.ui.toast('驾驶中无法播放演示');
      return;
    }
    this.timeline.toggle();
    this.ui.setDemoPlaying(this.timeline.playing);
    this.ui.setInfo(this.timeline.playing ? '自动演示中：空格暂停' : null);
  }

  home() {
    if (this.state.s.driving) this.exitDrive();
    if (this.timeline.playing) {
      this.timeline.pause();
      this.ui.setDemoPlaying(false);
    }
    this.state.reset();
    this.timeline.stop();
    this.applyScene('showroom', false);
    this.act.setWing(false);
    this.act.setDoors(false);
    this.ui.setDemoPlaying(false);
    this.ui.toast('已复位');
  }

  screenshot() {
    this.renderFrame(0);
    const url = this.view.renderer.domElement.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `nova-hypercar-${Date.now()}.png`;
    a.click();
    this.ui.toast('已保存 PNG 截图');
    return url;
  }

  /* ---------------- 键盘 ---------------- */

  private bindKeys() {
    window.addEventListener('keydown', (e) => {
      const el = document.activeElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      switch (e.key.toLowerCase()) {
        case 'escape':
          if (this.state.s.driving) this.exitDrive();
          else if (this.state.s.photo) this.state.set('photo', false);
          break;
        case 'p':
          this.state.toggle('photo');
          break;
        case 'r':
          this.home();
          break;
        case ' ':
          e.preventDefault();
          this.toggleDemo();
          break;
        case 'c':
          if (this.state.s.driving) {
            this.drive.cycleCam();
            this.state.set('driveCam', this.drive.cam);
          }
          break;
        case 'f':
          this.state.toggle('flow');
          break;
        case 'l':
          this.state.toggle('headlights');
          break;
        default:
          break;
      }
    });
    // 驾驶输入：失焦/切后台由 Drive 内部监听清空，这里只处理退出
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.state.s.driving) this.exitDrive();
    });
  }

  /* ---------------- 主循环 ---------------- */

  private renderFrame(dt: number) {
    this.post.render(dt);
  }

  private loop = () => {
    requestAnimationFrame(this.loop);
    // 钳位只用于防止切后台后的大跳；钳得太紧会让低帧率下所有动作变成慢动作
    const dt = Math.min(0.25, this.clock.getDelta());
    this.t += dt;
    const s = this.state.s;

    // 机械动作：绝对姿态求值
    this.act.update(dt);
    if (s.driving) {
      this.drive.update(dt, this.t);
    } else {
      this.act.pose();
      this.exhaust.set(0, 0);
      this.exhaust.update(this.t);
      this.spray.update(dt, this.t, 0, 0, s.wet && s.scene === 'rain');
    }
    this.act.poseExplode(s.explode, s.explodeMode, s.selected);

    // 特效
    this.mats.update(this.t);
    this.flow.update(this.t);
    this.volume.setEnabled(s.headlights && s.volumetric, s.scene === 'rain');
    this.volume.update(this.t);
    this.volume.setBrake(s.driving && this.drive.brake ? 1 : 0);

    // 场景
    const sc = this.scenes[s.scene];
    if (sc) sc.update(dt, this.t);
    if (s.scene === 'rain' && !s.driving) this.rainScene.road.update(0);

    // 驾驶舱视角：车身外壳是封闭曲面，不隐藏会挡住整条视野
    const cockpit = s.driving && this.drive.cam === 'cockpit';
    this.model.parts.body.visible = !cockpit;
    this.model.parts.hood.visible = !cockpit;
    this.model.parts.headlight.visible = !cockpit;
    this.model.parts.splitter.visible = !cockpit;

    // 演示
    if (this.timeline.playing) {
      this.timeline.update(dt);
      this.ui.setDemoPlaying(true);
    }

    // 相机
    this.updateCamera(dt);

    // 部件标注
    if (s.scene === 'analysis' && sc.setLabel) {
      this.labelTick = (this.labelTick + 1) % 4;
      if (this.labelTick === 0) {
        if (s.selected && this.model.parts[s.selected]) {
          this.box.setFromObject(this.model.parts[s.selected]);
          this.box.getCenter(this.center);
          sc.setLabel(this.center, PART_DEFS.find((p) => p.id === s.selected)?.name ?? '');
        } else {
          sc.setLabel(null, '');
        }
      }
    }

    // 后处理 + 渲染
    this.post.update(this.t);
    this.renderFrame(dt);

    // FPS
    this.fpsAcc += dt;
    this.fpsCount++;
    if (this.fpsAcc >= 0.5) {
      this.fpsEl.textContent = Math.round(this.fpsCount / this.fpsAcc) + ' FPS';
      this.fpsAcc = 0;
      this.fpsCount = 0;
    }
  };

  private updateCamera(dt: number) {
    const cam = this.view.camera;
    const controls = this.view.controls;
    const s = this.state.s;

    if (s.driving) {
      controls.enabled = false;
      controls.autoRotate = false;
      return; // 相机由 Drive 控制
    }

    if (this.timeline.playing) {
      const tl = this.timeline;
      this.tgtTo.set(...tl.camTarget);
      controls.target.lerp(this.tgtTo, 1 - Math.exp(-3 * dt));
      if (tl.orbit) {
        controls.enabled = true;
        controls.autoRotate = true;
        controls.autoRotateSpeed = 0.55;
        controls.update();
      } else {
        controls.enabled = false;
        controls.autoRotate = false;
        this.camTo.set(...tl.camPos);
        cam.position.lerp(this.camTo, 1 - Math.exp(-2.6 * dt));
        cam.lookAt(controls.target);
      }
      return;
    }

    controls.autoRotate = false;
    if (this.camLerp > 0) {
      this.camLerp = Math.max(0, this.camLerp - dt);
      const k = easeInOut(1 - this.camLerp / this.camLerpDur);
      cam.position.lerpVectors(this.camFrom, this.camTo, k);
      controls.target.lerpVectors(this.tgtFrom, this.tgtTo, k);
      controls.enabled = false;
    } else {
      controls.enabled = true;
    }
    if (Math.abs(cam.fov - 38) > 0.01) {
      cam.fov = damp(cam.fov, 38, 6, dt);
      cam.updateProjectionMatrix();
    }
    controls.update();
  }

  /* ---------------- 公共接口 ---------------- */

  private exposeNova() {
    const api = {
      version: '2.1.0',
      app: this,
      state: () => ({ ...this.state.s }),
      set: (k: keyof Settings, v: unknown) => this.state.set(k, v as Settings[typeof k]),
      setScene: (id: SceneId) => this.state.set('scene', id),
      setShade: (id: ShadeId) => this.state.set('shade', id),
      setQuality: (id: QualityId) => this.state.set('quality', id),
      setFinish: (id: FinishId) => this.state.set('finish', id),
      setPaint: (id: string) => this.state.set('paint', id),
      setExplode: (v: number) => this.state.set('explode', clamp(v)),
      setExplodeMode: (m: 'all' | 'single') => this.state.set('explodeMode', m),
      selectPart: (id: string | null) => this.state.set('selected', id),
      setWing: (on: boolean) => this.state.set('wing', on),
      setDoors: (on: boolean) => this.state.set('doors', on),
      setHeadlights: (on: boolean) => this.state.set('headlights', on),
      enterDrive: (cam?: DriveCam) => this.enterDrive(cam ?? 'chase'),
      exitDrive: () => this.exitDrive(),
      setDriveCam: (cam: DriveCam) => {
        this.drive.setCam(cam);
        this.state.set('driveCam', cam);
      },
      driveState: () => ({
        speed: this.drive.speed,
        kmh: this.drive.speed * 3.6,
        distance: this.drive.distance,
        nitro: this.drive.nitro,
        cam: this.drive.cam,
        lateral: this.drive.lateral
      }),
      demo: {
        play: () => {
          this.timeline.play();
          this.ui.setDemoPlaying(true);
        },
        pause: () => {
          this.timeline.pause();
          this.ui.setDemoPlaying(false);
        },
        stop: () => {
          this.timeline.stop();
          this.ui.setDemoPlaying(false);
        },
        seek: (t: number) => this.timeline.seek(t),
        get time() {
          return 0;
        }
      },
      pose: (o?: { wing?: number; doors?: number; steer?: number; distance?: number }) => {
        this.act.pose(o);
        this.act.poseExplode(this.state.s.explode, this.state.s.explodeMode, this.state.s.selected);
      },
      screenshot: () => this.screenshot(),
      reset: () => this.home(),
      parts: PART_DEFS.map((p) => p.id)
    };
    Object.defineProperty(api.demo, 'time', { get: () => this.timeline.time });
    (window as unknown as { NOVA: typeof api }).NOVA = api;
  }
}
