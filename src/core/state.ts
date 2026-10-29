import { Emitter } from './util';
import type { ShadeId, FinishId } from '../vehicle/materials';

export type SceneId = 'showroom' | 'analysis' | 'lab' | 'rain';
export type QualityId = 'high' | 'balanced' | 'low';
export type DriveCam = 'cockpit' | 'hood' | 'chase';
export type ExplodeMode = 'all' | 'single';

export const SCENES: Array<{ id: SceneId; name: string; en: string }> = [
  { id: 'showroom', name: '精密展厅', en: 'Showroom' },
  { id: 'analysis', name: '工程分析', en: 'Analysis' },
  { id: 'lab', name: '全息实验室', en: 'Holo Lab' },
  { id: 'rain', name: '赛博雨夜', en: 'Cyber Rain' }
];

export const QUALITIES: Array<{ id: QualityId; name: string }> = [
  { id: 'high', name: 'High' },
  { id: 'balanced', name: 'Balanced' },
  { id: 'low', name: 'Low' }
];

export interface Settings {
  scene: SceneId;
  shade: ShadeId;
  quality: QualityId;
  finish: FinishId;
  paint: string;
  /** 部件拆解总量 0..1 */
  explode: number;
  explodeMode: ExplodeMode;
  selected: string | null;
  isolate: boolean;
  headlights: boolean;
  volumetric: boolean;
  wet: boolean;
  flow: boolean;
  wing: boolean;
  doors: boolean;
  autoPlay: boolean;
  driving: boolean;
  driveCam: DriveCam;
  /** 摄影模式（冻结时间线、隐藏 UI） */
  photo: boolean;
}

export type StateEvents = {
  change: { key: keyof Settings; from: unknown; to: unknown };
  any: Settings;
};

export class State extends Emitter<StateEvents> {
  s: Settings = {
    scene: 'showroom',
    shade: 'surface',
    quality: 'high',
    finish: 'cinematic',
    paint: 'cyan',
    explode: 0,
    explodeMode: 'all',
    selected: null,
    isolate: false,
    headlights: true,
    volumetric: true,
    wet: true,
    flow: false,
    wing: false,
    doors: false,
    autoPlay: false,
    driving: false,
    driveCam: 'chase',
    photo: false
  };

  set<K extends keyof Settings>(key: K, value: Settings[K]) {
    const from = this.s[key];
    if (from === value) return;
    this.s[key] = value;
    this.emit('change', { key, from, to: value });
    this.emit('any', this.s);
  }

  toggle(key: keyof Settings) {
    this.set(key, !this.s[key] as Settings[typeof key]);
  }

  /** 一键复位到默认展示状态 */
  reset() {
    const cam = this.s.driveCam;
    this.s = {
      ...this.s,
      scene: 'showroom',
      shade: 'surface',
      explode: 0,
      explodeMode: 'all',
      selected: null,
      isolate: false,
      wing: false,
      doors: false,
      driving: false,
      autoPlay: false,
      photo: false,
      driveCam: cam
    };
    this.emit('any', this.s);
  }
}
