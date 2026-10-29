import * as THREE from 'three';
import { VehicleModel, PART_DEFS } from './model';
import { clamp, easeInOut } from '../core/util';

interface Base {
  pos: THREE.Vector3;
  rot: THREE.Euler;
  scale: THREE.Vector3;
}

/**
 * 机械动作：尾翼 / 车门 / 转向 / 车轮滚动 / 部件拆解。
 *
 * 核心原则：**一切姿态都用「基准 + 归一化进度的绝对量」求值，绝不做逐帧累加**。
 * 实时交互、摄影冻结、自动演示、seek、renderAt 全部走同一个 pose()，
 * 因此任意帧率下终点一致，反复开关不会漂移。
 */
export class Actuation {
  private model: VehicleModel;
  private bases = new Map<THREE.Object3D, Base>();
  private partBase = new Map<string, THREE.Vector3>();

  /** 归一化线性进度（0..1），由 update() 推进 */
  wingP = 0;
  doorP = 0;
  /** 转向 -1..1、累计行驶路程（米） */
  steer = 0;
  distance = 0;

  wingTarget = 0;
  doorTarget = 0;
  /** 摄影 / 时间线定位的姿态覆盖（优先级高于实时进度） */
  private ov: { wing?: number; doors?: number } = {};

  wingDur = 0.7;
  doorDur = 0.72;

  constructor(model: VehicleModel) {
    this.model = model;
    this.model.root.traverse((o) => {
      this.bases.set(o, {
        pos: o.position.clone(),
        rot: o.rotation.clone(),
        scale: o.scale.clone()
      });
    });
    for (const def of PART_DEFS) {
      const p = this.model.parts[def.id];
      this.partBase.set(def.id, p.position.clone());
    }
  }

  private base(o: THREE.Object3D | null): Base {
    let b = o ? this.bases.get(o) : undefined;
    if (!b && o) {
      b = { pos: o.position.clone(), rot: o.rotation.clone(), scale: o.scale.clone() };
      this.bases.set(o, b);
    }
    return b ?? { pos: new THREE.Vector3(), rot: new THREE.Euler(), scale: new THREE.Vector3(1, 1, 1) };
  }

  /** 目标开关（尾翼 / 车门）；交互会清除摄影/时间线的姿态覆盖 */
  setWing(open: boolean) {
    this.wingTarget = open ? 1 : 0;
    delete this.ov.wing;
  }
  setDoors(open: boolean) {
    this.doorTarget = open ? 1 : 0;
    delete this.ov.doors;
  }

  /** 推进归一化进度：与帧率无关，终点严格停在 0 / 1 */
  update(dt: number) {
    const step = (cur: number, target: number, dur: number) => {
      if (cur === target) return target;
      const d = dt / Math.max(0.0001, dur);
      return target > cur ? Math.min(target, cur + d) : Math.max(target, cur - d);
    };
    this.wingP = step(this.wingP, this.wingTarget, this.wingDur);
    this.doorP = step(this.doorP, this.doorTarget, this.doorDur);
  }

  /** 缓动后的实际姿态量 */
  get wingEased() {
    return easeInOut(this.wingP);
  }
  get doorEased() {
    return easeInOut(this.doorP);
  }

  /**
   * 统一姿态求值。t 为可选覆盖值（seek / renderAt / 摄影冻结用）。
   * 传入的覆盖值会**持久化**，否则会被下一帧的主循环冲掉 —— 这正是时间线定位需要的语义。
   */
  pose(opt?: { wing?: number; doors?: number; steer?: number; distance?: number }) {
    if (opt?.wing !== undefined) this.ov.wing = clamp(opt.wing);
    if (opt?.doors !== undefined) this.ov.doors = clamp(opt.doors);
    if (opt?.steer !== undefined) this.steer = opt.steer;
    if (opt?.distance !== undefined) this.distance = opt.distance;

    const wt = clamp(this.ov.wing ?? this.wingEased);
    const dt = clamp(this.ov.doors ?? this.doorEased);
    const st = opt?.steer ?? this.steer;
    const dist = opt?.distance ?? this.distance;
    const n = this.model.nodes;

    // ---- 尾翼：翼面俯仰 + 升降；支架与执行机构分别处理，不整体翻转 ----
    if (n.wingSurface) {
      const b = this.base(n.wingSurface);
      n.wingSurface.position.set(b.pos.x, b.pos.y + 0.28 * wt, b.pos.z + 0.05 * wt);
      n.wingSurface.rotation.set(b.rot.x - 0.32 * wt, b.rot.y, b.rot.z);
    }
    for (const s of n.wingStruts) {
      const b = this.base(s);
      s.scale.set(b.scale.x, b.scale.y * (1 + 1.27 * wt), b.scale.z);
      s.position.set(b.pos.x, b.pos.y, b.pos.z);
      s.rotation.set(b.rot.x, b.rot.y, b.rot.z);
    }
    for (const a of n.wingActuators) {
      const b = this.base(a);
      a.scale.set(b.scale.x, b.scale.y * (1 + 0.8 * wt), b.scale.z);
      a.position.set(b.pos.x, b.pos.y, b.pos.z);
      a.rotation.set(b.rot.x, b.rot.y, b.rot.z);
    }

    // ---- 车门：绕铰链有限俯仰（剪刀门），绝对角度 ----
    const open = 1.05 * dt;
    if (n.doors.L) {
      const b = this.base(n.doors.L);
      n.doors.L.rotation.set(b.rot.x, b.rot.y, b.rot.z - open);
      n.doors.L.position.set(b.pos.x, b.pos.y + 0.015 * dt, b.pos.z);
    }
    if (n.doors.R) {
      const b = this.base(n.doors.R);
      n.doors.R.rotation.set(b.rot.x, b.rot.y, b.rot.z + open);
      n.doors.R.position.set(b.pos.x, b.pos.y + 0.015 * dt, b.pos.z);
    }

    // ---- 方向盘 / 前轮转向联动 ----
    if (n.steeringWheel) {
      const b = this.base(n.steeringWheel);
      n.steeringWheel.rotation.set(b.rot.x, b.rot.y, b.rot.z - st * 2.4);
    }
    for (const id of Object.keys(n.steers)) {
      const o = n.steers[id];
      if (!o) continue;
      const b = this.base(o);
      const front = id === 'wheelFL' || id === 'wheelFR';
      o.rotation.set(b.rot.x, b.rot.y - (front ? st * 0.34 : 0), b.rot.z);
    }

    // ---- 车轮滚动：由累计路程直接求得，不做累加 ----
    for (const id of Object.keys(n.spins)) {
      const o = n.spins[id];
      if (!o) continue;
      const r = id === 'wheelRL' || id === 'wheelRR' ? 0.37 : 0.35;
      o.rotation.x = -dist / r;
    }
  }

  /** 部件拆解：绝对位移，归位即回到基准点 */
  poseExplode(amount: number, mode: 'all' | 'single', selected: string | null) {
    const t = clamp(amount);
    for (const def of PART_DEFS) {
      const p = this.model.parts[def.id];
      const base = this.partBase.get(def.id);
      if (!base) continue;
      const on = mode === 'all' || (mode === 'single' && selected === def.id);
      const k = on ? t : 0;
      const dir = p.userData.explode as THREE.Vector3;
      p.position.set(base.x + dir.x * k * 1.15, base.y + dir.y * k * 1.15, base.z + dir.z * k * 1.15);
    }
  }
}
