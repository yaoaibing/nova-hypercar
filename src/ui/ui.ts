import { State, SCENES, QUALITIES, type SceneId, type QualityId, type DriveCam } from '../core/state';
import { PART_DEFS, CATEGORIES } from '../vehicle/model';
import { SHADES, PAINTS, type ShadeId, type FinishId } from '../vehicle/materials';
import type { DriveHud } from '../driving/drive';

export interface UIHandlers {
  onScene(id: SceneId): void;
  onShade(id: ShadeId): void;
  onQuality(id: QualityId): void;
  onFinish(id: FinishId): void;
  onPaint(id: string): void;
  onToggle(key: 'headlights' | 'volumetric' | 'wet' | 'isolate' | 'flow' | 'wing' | 'doors'): void;
  onExplode(v: number): void;
  onMode(mode: 'all' | 'single'): void;
  onSelect(id: string | null): void;
  onHome(): void;
  onDemo(): void;
  onDrive(): void;
  onExitDrive(): void;
  onCam(cam: DriveCam): void;
  onPhoto(): void;
  onShot(): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function card(parent: HTMLElement, title: string, hint?: string): HTMLElement {
  const c = el('div', 'card');
  const h = el('h3');
  h.appendChild(el('span', undefined, title));
  if (hint) h.appendChild(el('em', undefined, hint));
  c.appendChild(h);
  parent.appendChild(c);
  return c;
}

function btnRow(
  parent: HTMLElement,
  items: Array<{ id: string; label: string }>,
  active: string,
  onClick: (id: string) => void,
  cols = 2,
  cls = ''
): Array<HTMLButtonElement> {
  const g = el('div', `grid g${cols}`);
  const btns: Array<HTMLButtonElement> = [];
  for (const it of items) {
    const b = el('button', 'btn ' + cls, it.label);
    if (it.id === active) b.classList.add('on');
    b.onclick = () => onClick(it.id);
    g.appendChild(b);
    btns.push(b);
  }
  parent.appendChild(g);
  return btns;
}

function toggle(parent: HTMLElement, label: string, on: boolean, onClick: () => void) {
  const t = el('div', 'toggle' + (on ? ' on' : ''));
  t.appendChild(el('span', undefined, label));
  t.appendChild(el('span', 'sw'));
  t.onclick = onClick;
  parent.appendChild(t);
  return t;
}

export class UI {
  private state: State;
  private h: UIHandlers;
  private left: HTMLElement;
  private right: HTMLElement;
  private hud: HTMLElement;
  private toastEl: HTMLElement;
  private infoEl: HTMLElement;

  private sceneBtns: Array<HTMLButtonElement> = [];
  private shadeBtns: Array<HTMLButtonElement> = [];
  private qualityBtns: Array<HTMLButtonElement> = [];
  private finishBtns: Array<HTMLButtonElement> = [];
  private paintBtns: Array<HTMLButtonElement> = [];
  private toggles: Record<string, HTMLElement> = {};
  private modeBtns: Array<HTMLButtonElement> = [];
  private explodeInput!: HTMLInputElement;
  private explodeVal!: HTMLElement;
  private partRows: Record<string, HTMLElement> = {};
  private detailBox!: HTMLElement;
  private driveBtn!: HTMLButtonElement;
  private demoBtn!: HTMLButtonElement;
  private explodeCard!: HTMLElement;
  private partCard!: HTMLElement;
  private hudSpeed!: HTMLElement;
  private hudNitroBar!: HTMLElement;
  private hudCam!: HTMLElement;
  private hudKeys: Record<string, HTMLElement> = {};

  constructor(state: State, h: UIHandlers) {
    this.state = state;
    this.h = h;
    this.left = document.getElementById('panel-left')!;
    this.right = document.getElementById('panel-right')!;
    this.hud = document.getElementById('hud')!;
    this.toastEl = document.getElementById('toast')!;
    this.infoEl = document.getElementById('info')!;
    this.buildLeft();
    this.buildRight();
    this.buildHud();
    state.on('any', () => this.refresh());
    this.refresh();
  }

  /* ---------------- 左侧 ---------------- */

  private buildLeft() {
    const s = this.state.s;

    const c1 = card(this.left, '场景', 'SCENE');
    this.sceneBtns = btnRow(
      c1,
      SCENES.map((x) => ({ id: x.id, label: x.name })),
      s.scene,
      (id) => this.h.onScene(id as SceneId),
      2
    );

    const c2 = card(this.left, '着色模式', 'SHADE');
    this.shadeBtns = btnRow(
      c2,
      SHADES.map((x) => ({ id: x.id, label: x.name })),
      s.shade,
      (id) => this.h.onShade(id as ShadeId),
      2
    );

    const c3 = card(this.left, '车漆', 'PAINT');
    this.paintBtns = btnRow(
      c3,
      PAINTS.map((x) => ({ id: x.id, label: x.name })),
      s.paint,
      (id) => this.h.onPaint(id),
      2
    );

    const c4 = card(this.left, '画质与材质', 'QUALITY');
    this.qualityBtns = btnRow(
      c4,
      QUALITIES.map((x) => ({ id: x.id, label: x.name })),
      s.quality,
      (id) => this.h.onQuality(id as QualityId),
      3
    );
    this.finishBtns = btnRow(
      c4,
      [
        { id: 'cinematic', label: '电影级' },
        { id: 'cyber', label: '赛博' }
      ],
      s.finish,
      (id) => this.h.onFinish(id as FinishId),
      2,
      'mg'
    );

    const c5 = card(this.left, '部件拆解', 'EXPLODE');
    this.explodeCard = c5;
    this.modeBtns = btnRow(
      c5,
      [
        { id: 'all', label: '整体' },
        { id: 'single', label: '单件' }
      ],
      s.explodeMode,
      (id) => this.h.onMode(id as 'all' | 'single'),
      2
    );
    const sl = el('div', 'slider');
    sl.appendChild(el('label', undefined, '拆解'));
    this.explodeInput = el('input');
    this.explodeInput.type = 'range';
    this.explodeInput.min = '0';
    this.explodeInput.max = '100';
    this.explodeInput.value = String(Math.round(s.explode * 100));
    this.explodeInput.oninput = () => this.h.onExplode(Number(this.explodeInput.value) / 100);
    sl.appendChild(this.explodeInput);
    this.explodeVal = el('b', undefined, Math.round(s.explode * 100) + '%');
    sl.appendChild(this.explodeVal);
    c5.appendChild(sl);
    const home = el('button', 'btn wide', '全部归位');
    home.onclick = () => this.h.onHome();
    c5.appendChild(home);

    const c6 = card(this.left, '显示与机构', 'SYSTEM');
    this.toggles.headlights = toggle(c6, '前大灯', s.headlights, () => this.h.onToggle('headlights'));
    this.toggles.volumetric = toggle(c6, '体积光', s.volumetric, () => this.h.onToggle('volumetric'));
    this.toggles.wet = toggle(c6, '湿地反射', s.wet, () => this.h.onToggle('wet'));
    this.toggles.isolate = toggle(c6, '系统隔离', s.isolate, () => this.h.onToggle('isolate'));
    this.toggles.flow = toggle(c6, '动力流线', s.flow, () => this.h.onToggle('flow'));
    this.toggles.wing = toggle(c6, '主动尾翼', s.wing, () => this.h.onToggle('wing'));
    this.toggles.doors = toggle(c6, '车门开启', s.doors, () => this.h.onToggle('doors'));

    const c7 = card(this.left, '操作', 'ACTION');
    const row1 = el('div', 'grid g2');
    this.demoBtn = el('button', 'btn', '自动演示');
    this.demoBtn.onclick = () => this.h.onDemo();
    this.driveBtn = el('button', 'btn', '进入驾驶');
    this.driveBtn.onclick = () => this.h.onDrive();
    row1.appendChild(this.demoBtn);
    row1.appendChild(this.driveBtn);
    c7.appendChild(row1);
    const row2 = el('div', 'grid g2');
    const photo = el('button', 'btn', '摄影模式');
    photo.onclick = () => this.h.onPhoto();
    const shot = el('button', 'btn', 'PNG 截图');
    shot.onclick = () => this.h.onShot();
    row2.appendChild(photo);
    row2.appendChild(shot);
    c7.appendChild(row2);
    const reset = el('button', 'btn wide', '全局复位 (R)');
    reset.onclick = () => this.h.onHome();
    c7.appendChild(reset);

    const c8 = card(this.left, '快捷键', 'KEYS');
    const k = el('div', 'grid g2');
    [
      ['W/↑', '加速'],
      ['S/↓', '刹车'],
      ['A/D', '转向'],
      ['Shift', '氮气'],
      ['C', '切视角'],
      ['Esc', '退出驾驶'],
      ['P', '摄影'],
      ['Space', '演示']
    ].forEach(([a, b]) => {
      const r = el('div', 'toggle');
      const s1 = el('span', undefined, a);
      s1.style.flex = '0 0 auto';
      const s2 = el('span', undefined, b);
      s2.style.color = 'rgba(139,163,181,.8)';
      r.appendChild(s1);
      r.appendChild(s2);
      r.style.cursor = 'default';
      k.appendChild(r);
    });
    c8.appendChild(k);
  }

  /* ---------------- 右侧 ---------------- */

  private buildRight() {
    const c1 = card(this.right, '部件', '17 PARTS');
    this.partCard = c1;
    const list = el('div', 'parts');
    for (const def of PART_DEFS) {
      const row = el('div', 'part-row');
      const dot = el('span', 'dot');
      dot.style.background = CATEGORIES[def.category].color;
      row.appendChild(dot);
      row.appendChild(el('span', 'nm', def.name));
      row.appendChild(el('span', 'ct', CATEGORIES[def.category].name));
      row.onclick = () => this.h.onSelect(this.state.s.selected === def.id ? null : def.id);
      list.appendChild(row);
      this.partRows[def.id] = row;
    }
    c1.appendChild(list);
    this.detailBox = el('div', 'detail');
    this.detailBox.style.display = 'none';
    c1.appendChild(this.detailBox);
  }

  /* ---------------- HUD ---------------- */

  private buildHud() {
    this.hud.innerHTML = '';
    const spd = el('div', 'spd');
    this.hudSpeed = el('div', 'v', '0');
    spd.appendChild(this.hudSpeed);
    spd.appendChild(el('div', 'u', 'KM/H'));
    this.hud.appendChild(spd);

    const col = el('div', 'col');
    const r1 = el('div', 'rowl');
    r1.appendChild(el('span', undefined, 'NITRO'));
    const gear = el('span', undefined, 'D');
    r1.appendChild(gear);
    col.appendChild(r1);
    const bar = el('div', 'bar nitro');
    this.hudNitroBar = el('i');
    bar.appendChild(this.hudNitroBar);
    col.appendChild(bar);
    this.hudGear = gear;

    const keys = el('div', 'keys');
    for (const [k, label] of [
      ['throttle', 'W'],
      ['brake', 'S'],
      ['left', 'A'],
      ['right', 'D'],
      ['boost', 'SHIFT']
    ] as Array<[string, string]>) {
      const b = el('span', 'key', label);
      keys.appendChild(b);
      this.hudKeys[k] = b;
    }
    col.appendChild(keys);
    this.hud.appendChild(col);

    this.hudCam = el('div', 'cam', '追车');
    this.hud.appendChild(this.hudCam);
  }
  private hudGear!: HTMLElement;

  setHud(h: DriveHud) {
    this.hudSpeed.textContent = String(Math.round(h.kmh));
    this.hudNitroBar.style.width = (h.nitro * 100).toFixed(1) + '%';
    this.hudCam.textContent = h.cam === 'chase' ? '追车' : h.cam === 'cockpit' ? '驾驶舱' : '车头';
    this.hudGear.textContent = h.gear === 0 ? 'N' : 'D' + h.gear;
    this.hudKeys.throttle.classList.toggle('act', h.throttle);
    this.hudKeys.brake.classList.toggle('act', h.brake);
    this.hudKeys.left.classList.toggle('act', h.left);
    this.hudKeys.right.classList.toggle('act', h.right);
    this.hudKeys.boost.classList.toggle('act', h.boost);
  }

  setDriving(on: boolean) {
    this.hud.classList.toggle('hidden', !on);
    this.driveBtn.textContent = on ? '退出驾驶' : '进入驾驶';
    this.driveBtn.classList.toggle('on', on);
    this.driveBtn.onclick = () => (on ? this.h.onExitDrive() : this.h.onDrive());
    this.explodeCard.style.opacity = on ? '0.4' : '1';
    this.explodeInput.disabled = on;
    this.partCard.style.opacity = on ? '0.4' : '1';
    this.demoBtn.disabled = on;
    this.left.style.opacity = on ? '0.55' : '1';
  }

  setInfo(msg: string | null) {
    if (!msg) {
      this.infoEl.classList.add('hidden');
      return;
    }
    this.infoEl.textContent = msg;
    this.infoEl.classList.remove('hidden');
  }

  toast(msg: string) {
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('show');
    clearTimeout(this._tt);
    this._tt = window.setTimeout(() => this.toastEl.classList.remove('show'), 1900);
  }
  private _tt = 0;

  setDemoPlaying(on: boolean) {
    this.demoBtn.textContent = on ? '停止演示' : '自动演示';
    this.demoBtn.classList.toggle('on', on);
  }

  /* ---------------- 同步 ---------------- */

  refresh() {
    const s = this.state.s;
    const setActive = (btns: Array<HTMLButtonElement>, active: string, ids: string[]) => {
      btns.forEach((b, i) => b.classList.toggle('on', ids[i] === active));
    };
    setActive(this.sceneBtns, s.scene, SCENES.map((x) => x.id));
    setActive(this.shadeBtns, s.shade, SHADES.map((x) => x.id));
    setActive(this.paintBtns, s.paint, PAINTS.map((x) => x.id));
    setActive(this.qualityBtns, s.quality, QUALITIES.map((x) => x.id));
    setActive(this.finishBtns, s.finish, ['cinematic', 'cyber']);
    setActive(this.modeBtns, s.explodeMode, ['all', 'single']);

    for (const key of ['headlights', 'volumetric', 'wet', 'isolate', 'flow', 'wing', 'doors'] as const) {
      this.toggles[key]?.classList.toggle('on', s[key]);
    }

    if (document.activeElement !== this.explodeInput) {
      this.explodeInput.value = String(Math.round(s.explode * 100));
    }
    this.explodeVal.textContent = Math.round(s.explode * 100) + '%';

    for (const def of PART_DEFS) {
      this.partRows[def.id].classList.toggle('sel', s.selected === def.id);
    }
    this.renderDetail(s.selected);
  }

  private renderDetail(id: string | null) {
    if (!id) {
      this.detailBox.style.display = 'none';
      return;
    }
    const def = PART_DEFS.find((p) => p.id === id);
    if (!def) return;
    this.detailBox.style.display = 'block';
    this.detailBox.innerHTML = '';
    this.detailBox.appendChild(el('div', 'dn', def.name));
    this.detailBox.appendChild(el('div', 'dc', def.en + ' · ' + def.desc));
    for (const [k, v] of def.specs) {
      const row = el('div', 'kv');
      row.appendChild(el('span', undefined, k));
      row.appendChild(el('b', undefined, v));
      this.detailBox.appendChild(row);
    }
    const tags = el('div', 'tags');
    for (const t of def.tags) tags.appendChild(el('span', 'tag', t));
    this.detailBox.appendChild(tags);
  }
}
