import * as THREE from 'three';
import type { DriveCam } from '../core/state';
import { clamp, damp } from '../core/util';
import type { Actuation } from '../vehicle/actuation';
import type { Road } from './road';
import type { RainFX } from '../effects/weather';
import type { ExhaustFX, SprayFX } from '../effects/drive';
import { ROAD_INFO } from './road';

export interface DriveHud {
  kmh: number;
  nitro: number;
  cam: DriveCam;
  throttle: boolean;
  brake: boolean;
  left: boolean;
  right: boolean;
  boost: boolean;
  gear: number;
}

interface DriveCtx {
  camera: THREE.PerspectiveCamera;
  vehicle: THREE.Group;
  actuation: Actuation;
  road: Road;
  rain: RainFX;
  exhaust: ExhaustFX;
  spray: SprayFX;
  wet: () => boolean;
  onHud?: (h: DriveHud) => void;
}

const MAX_SPEED = 86; // m/s ≈ 310 km/h

/**
 * 轻量街机驾驶：不做完整车辆物理，只做速度、横移、偏航、侧倾与氮气。
 * 车停在原点，路面按 distance 后移（跑步机），避免浮点累积误差。
 */
export class Drive {
  active = false;
  cam: DriveCam = 'chase';

  speed = 0;
  distance = 0;
  lateral = 0;
  steer = 0;
  steerInput = 0;
  yaw = 0;
  roll = 0;
  nitro = 1;
  boost = false;
  throttle = false;
  brake = false;
  /** 自动演示时的模拟输入 */
  autoDrive = false;
  private autoSteer = 0;
  private autoBoost = false;

  private keys = new Set<string>();
  private ctx: DriveCtx;
  private tmpV = new THREE.Vector3();
  private lookV = new THREE.Vector3();
  private nitroHold = 0;
  /** 进入时的过渡 */
  private trans = 0;
  private transDur = 0.9;

  constructor(ctx: DriveCtx) {
    this.ctx = ctx;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.clearKeys);
    document.addEventListener('visibilitychange', this.clearKeys);
  }

  dispose() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.clearKeys);
    document.removeEventListener('visibilitychange', this.clearKeys);
  }

  private clearKeys = () => {
    this.keys.clear();
  };

  private isTyping() {
    const el = document.activeElement;
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || (el as HTMLElement).isContentEditable;
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (!this.active || this.isTyping()) return;
    const k = e.key.toLowerCase();
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(k)) {
      this.keys.add(k);
      e.preventDefault();
    }
    if (k === 'c') {
      this.cycleCam();
      e.preventDefault();
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    this.keys.delete(k);
  };

  cycleCam() {
    const order: DriveCam[] = ['chase', 'cockpit', 'hood'];
    this.cam = order[(order.indexOf(this.cam) + 1) % 3];
  }

  setCam(c: DriveCam) {
    this.cam = c;
  }

  enter() {
    this.active = true;
    this.trans = 0;
    this.speed = Math.max(this.speed, 14);
    this.nitro = 1;
    this.ctx.camera.near = 0.05;
    this.ctx.camera.updateProjectionMatrix();
  }

  /** 退出：清空速度、尾焰、按键与追车镜头残留 */
  exit() {
    this.active = false;
    this.clearKeys();
    this.speed = 0;
    this.throttle = false;
    this.brake = false;
    this.boost = false;
    this.steer = 0;
    this.steerInput = 0;
    this.yaw = 0;
    this.roll = 0;
    this.lateral = 0;
    this.nitro = 1;
    this.ctx.exhaust.set(0, 0);
    this.ctx.camera.near = 0.06;
    this.ctx.camera.updateProjectionMatrix();
    const v = this.ctx.vehicle;
    v.position.set(0, 0, 0);
    v.rotation.set(0, 0, 0);
  }

  update(dt: number, t: number) {
    if (!this.active) {
      this.ctx.exhaust.set(0, 0);
      return;
    }
    const k = this.keys;
    let left = false;
    let right = false;
    if (this.autoDrive) {
      // 自动演示：全油门 + 缓慢 S 形走线 + 周期性氮气
      this.throttle = true;
      this.brake = false;
      this.autoSteer = Math.sin(t * 0.3) * 0.42 + Math.sin(t * 0.11 + 1.2) * 0.22;
      const cycle = t % 12;
      this.autoBoost = cycle > 3.2 && cycle < 7.6;
      left = this.autoSteer < -0.15;
      right = this.autoSteer > 0.15;
    } else {
      this.throttle = k.has('w') || k.has('arrowup');
      this.brake = k.has('s') || k.has('arrowdown');
      left = k.has('a') || k.has('arrowleft');
      right = k.has('d') || k.has('arrowright');
      this.autoBoost = k.has('shift');
    }
    const wantBoost = this.autoBoost && this.nitro > 0.02;

    // ---- 氮气：储量 / 消耗 / 恢复 ----
    if (wantBoost) {
      this.nitro = Math.max(0, this.nitro - dt * 0.3);
      this.nitroHold = 1.1;
      this.boost = this.nitro > 0;
    } else {
      this.nitroHold = Math.max(0, this.nitroHold - dt);
      if (this.nitroHold <= 0) this.nitro = Math.min(1, this.nitro + dt * 0.16);
      this.boost = false;
    }

    // ---- 纵向 ----
    const vmax = MAX_SPEED * (this.boost ? 1.2 : 1);
    let a = 0;
    if (this.throttle) a += this.boost ? 34 : 15;
    if (this.brake) a -= 30;
    a -= 0.55 + this.speed * 0.06; // 阻力
    if (this.speed <= 0 && a < 0) a = 0;
    this.speed = clamp(this.speed + a * dt, 0, vmax);
    this.distance += this.speed * dt;

    // ---- 转向：带阻尼与回正 ----
    const targetSteer = this.autoDrive ? clamp(this.autoSteer, -1, 1) : (right ? 1 : 0) - (left ? 1 : 0);
    const speedFactor = clamp(this.speed / 26, 0.25, 1);
    if (this.autoDrive) {
      this.steerInput = damp(this.steerInput, targetSteer, 2.6, dt);
    } else {
      this.steerInput = damp(this.steerInput, targetSteer, 6, dt);
      if (targetSteer === 0) this.steerInput = damp(this.steerInput, 0, 3.2, dt);
    }
    this.steer = this.steerInput * speedFactor;

    // 横移：有限幅度，靠边回推
    const halfLane = ROAD_INFO.ROAD_W / 2 - 1.4;
    this.lateral += this.steer * (2.2 + this.speed * 0.16) * dt;
    if (Math.abs(this.lateral) > halfLane) {
      this.lateral = Math.sign(this.lateral) * halfLane;
    }
    this.yaw = damp(this.yaw, -this.steer * 0.1, 8, dt);
    this.roll = damp(this.roll, this.steer * 0.05, 7, dt);

    // ---- 车身姿态 ----
    const v = this.ctx.vehicle;
    v.position.x = this.lateral;
    v.position.y = Math.sin(t * 9) * 0.006 * clamp(this.speed / 40);
    v.rotation.y = this.yaw;
    v.rotation.z = this.roll;
    v.rotation.x = damp(v.rotation.x, (this.brake ? 0.02 : 0) - (this.boost ? 0.012 : 0), 6, dt);

    // ---- 车轮 / 方向盘 ----
    this.ctx.actuation.steer = this.steerInput;
    this.ctx.actuation.distance = this.distance;
    this.ctx.actuation.pose();

    // ---- 世界：路面循环 + 雨跟随 ----
    this.ctx.road.update(this.distance);
    this.ctx.rain.update(dt, t, this.tmpV.set(this.lateral, 0.6, 0), this.speed);
    this.ctx.rain.setIntensity(1 + clamp(this.speed / MAX_SPEED) * 0.5);

    // ---- 特效 ----
    const power = clamp((this.throttle ? 0.55 : 0.12) + this.speed / MAX_SPEED * 0.5);
    this.ctx.exhaust.set(power, this.boost ? 1 : 0);
    this.ctx.exhaust.update(t);
    this.ctx.spray.update(dt, t, this.speed, this.steer, this.ctx.wet());

    // ---- 相机 ----
    this.trans = Math.min(this.transDur, this.trans + dt);
    this.updateCamera(dt);

    this.ctx.onHud?.({
      kmh: this.speed * 3.6,
      nitro: this.nitro,
      cam: this.cam,
      throttle: this.throttle,
      brake: this.brake,
      left,
      right,
      boost: this.boost,
      gear: this.speed < 0.5 ? 0 : Math.min(8, 1 + Math.floor(this.speed / 12))
    });
  }

  private updateCamera(dt: number) {
    const cam = this.ctx.camera;
    const v = this.ctx.vehicle;
    const speedK = clamp(this.speed / MAX_SPEED);
    const shake = (1 - clamp(this.trans / this.transDur)) * 0.0;

    if (this.cam === 'cockpit') {
      // 驾驶员眼点：能看到方向盘、仪表下沿与前方道路
      const eye = this.tmpV.set(-0.34 + this.lateral, 1.0, -0.2);
      cam.position.lerp(eye, 1 - Math.exp(-14 * dt));
      this.lookV.set(-0.34 + this.lateral + this.steer * 6, 0.86, -40);
      cam.lookAt(this.lookV);
      cam.rotation.z += this.roll * 0.6 + shake;
      cam.fov = damp(cam.fov, 70 + speedK * 8 + (this.boost ? 6 : 0), 5, dt);
    } else if (this.cam === 'hood') {
      const eye = this.tmpV.set(this.lateral * 0.9, 1.16, -2.15);
      cam.position.lerp(eye, 1 - Math.exp(-14 * dt));
      this.lookV.set(this.lateral + this.steer * 8, 0.72, -44);
      cam.lookAt(this.lookV);
      cam.rotation.z += this.roll * 0.35;
      cam.fov = damp(cam.fov, 66 + speedK * 10 + (this.boost ? 7 : 0), 5, dt);
    } else {
      // 第三人称追车：带速度阻尼
      const back = 7.4 + speedK * 3.4;
      const high = 2.0 - speedK * 0.35;
      const target = this.tmpV.set(this.lateral * 0.75 - this.yaw * 2.2, high, back);
      cam.position.lerp(target, 1 - Math.exp(-4.2 * dt));
      this.lookV.set(this.lateral * 0.9 + this.steer * 3.2, 0.78, -8);
      cam.lookAt(this.lookV);
      cam.rotation.z += this.roll * 0.25;
      cam.fov = damp(cam.fov, 58 + speedK * 12 + (this.boost ? 8 : 0), 4, dt);
    }
    cam.updateProjectionMatrix();
    void v;
  }
}
