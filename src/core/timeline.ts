import type { Settings, DriveCam } from './state';
import { clamp, easeInOut, smoothstep } from './util';

export interface TimelineApi {
  set<K extends keyof Settings>(key: K, value: Settings[K]): void;
  cam(pos: [number, number, number], target: [number, number, number], orbit: boolean): void;
  drive(on: boolean, cam?: DriveCam): void;
  /** 驾驶演示的自动输入覆盖 */
  autoDrive(on: boolean): void;
}

interface Step {
  t0: number;
  dur: number;
  apply(p: number, api: TimelineApi): void;
}

/** 缓动后的进度，末尾保持 */
const P = (p: number) => easeInOut(clamp(p));

/**
 * 约 78 秒自动演示。
 * 所有 step 的 apply 都是**绝对值**（不累加），因此可以任意 seek / renderAt 定位。
 */
function buildSteps(): Step[] {
  return [
    {
      t0: 0,
      dur: 7,
      apply: (p, api) => {
        api.set('scene', 'showroom');
        api.set('shade', 'surface');
        api.set('explode', 0);
        api.set('selected', null);
        api.set('wing', false);
        api.set('doors', false);
        api.cam([6.1, 2.25, 7.2], [0, 0.72, 0], true);
        void p;
      }
    },
    {
      t0: 7,
      dur: 7,
      apply: (p, api) => {
        api.set('selected', 'powertrain');
        api.set('explodeMode', 'single');
        api.set('explode', P(p) * 0.62);
        api.cam([3.4, 1.7, 4.2], [0.1, 0.6, 0.9], false);
      }
    },
    {
      t0: 14,
      dur: 8,
      apply: (p, api) => {
        api.set('explodeMode', 'all');
        api.set('explode', P(p));
        api.set('selected', null);
        api.cam([5.4, 3.0, 6.4], [0, 0.8, 0], true);
      }
    },
    {
      t0: 22,
      dur: 5,
      apply: (p, api) => {
        api.set('shade', 'xray');
        api.set('explode', 0.45 + P(p) * 0.25);
        api.cam([4.6, 2.2, 5.6], [0, 0.75, 0], true);
      }
    },
    {
      t0: 27,
      dur: 5,
      apply: (p, api) => {
        api.set('shade', 'blueprint');
        api.set('explode', 0.55 + P(p) * 0.2);
        api.cam([5.0, 2.6, -5.4], [0, 0.75, 0], false);
      }
    },
    {
      t0: 32,
      dur: 5,
      apply: (p, api) => {
        api.set('shade', 'hologram');
        api.set('explode', 0.6 + P(p) * 0.15);
        api.cam([3.2, 1.6, 4.6], [0, 0.85, 0.4], true);
      }
    },
    {
      t0: 37,
      dur: 5,
      apply: (p, api) => {
        api.set('shade', 'surface');
        api.set('explode', 0.75 * (1 - P(p)));
        api.cam([5.2, 2.1, 6.0], [0, 0.72, 0], true);
      }
    },
    {
      t0: 42,
      dur: 6,
      apply: (p, api) => {
        api.set('wing', p > 0.06);
        api.set('selected', 'wing');
        api.set('explode', 0);
        api.cam([0.4, 1.5, 5.6], [0, 0.95, 2.0], false);
      }
    },
    {
      t0: 48,
      dur: 6,
      apply: (p, api) => {
        api.set('doors', p > 0.06);
        api.set('selected', 'doorL');
        api.cam([-4.4, 1.8, 3.6], [-0.3, 0.8, 0.2], false);
      }
    },
    {
      t0: 54,
      dur: 5,
      apply: (p, api) => {
        api.set('doors', false);
        api.set('wing', false);
        api.set('scene', 'analysis');
        api.set('shade', 'surface');
        api.set('selected', 'powertrain');
        api.set('explode', P(p) * 0.5);
        api.cam([4.6, 2.4, 5.2], [0, 0.7, 0.6], false);
      }
    },
    {
      t0: 59,
      dur: 6,
      apply: (p, api) => {
        api.set('scene', 'lab');
        api.set('shade', 'hologram');
        api.set('explode', 0.5 * (1 - P(p)));
        api.set('selected', null);
        api.cam([4.4, 2.2, 5.0], [0, 0.8, 0], true);
      }
    },
    {
      t0: 65,
      dur: 6,
      apply: (p, api) => {
        api.set('scene', 'rain');
        api.set('shade', 'surface');
        api.set('headlights', true);
        api.set('volumetric', true);
        api.cam([5.0 - P(p) * 1.4, 1.7, 5.8], [0, 0.72, -0.4], false);
      }
    },
    {
      t0: 71,
      dur: 7,
      apply: (p, api) => {
        if (p < 0.08) {
          api.drive(true, 'chase');
          api.autoDrive(true);
        }
        if (p > 0.42 && p < 0.5) api.drive(true, 'cockpit');
        if (p > 0.72 && p < 0.8) api.drive(true, 'hood');
        if (p > 0.93) {
          api.autoDrive(false);
          api.drive(false);
        }
      }
    }
  ];
}

export class Timeline {
  duration = 78;
  time = 0;
  playing = false;
  private steps = buildSteps();
  private api: TimelineApi;

  /** 相机目标：由 app 平滑跟随 */
  camPos: [number, number, number] = [6.1, 2.25, 7.2];
  camTarget: [number, number, number] = [0, 0.72, 0];
  orbit = true;

  constructor(api: TimelineApi) {
    this.api = api;
  }

  play() {
    this.playing = true;
  }
  pause() {
    this.playing = false;
  }
  toggle() {
    this.playing = !this.playing;
  }
  stop() {
    this.playing = false;
    this.time = 0;
    this.seek(0);
  }

  update(dt: number) {
    if (!this.playing) return;
    this.time += dt;
    if (this.time >= this.duration) this.time = 0;
    this.seek(this.time);
  }

  /** 定位到任意时刻：所有 step 以绝对方式重新求值 */
  seek(t: number) {
    for (const s of this.steps) {
      const p = clamp((t - s.t0) / s.dur);
      s.apply(p, this.api);
    }
  }

  /** 供摄影/离屏渲染使用 */
  renderAt(t: number) {
    this.seek(t);
  }

  get progress() {
    return smoothstep(this.time / this.duration);
  }
}
