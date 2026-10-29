export const clamp = (v: number, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const invLerp = (a: number, b: number, v: number) => (b === a ? 0 : (v - a) / (b - a));
export const smoothstep = (t: number) => {
  const x = clamp(t);
  return x * x * (3 - 2 * x);
};
/** 缓入缓出，用于机械动作（0.6–0.8s 区间的默认曲线） */
export const easeInOut = (t: number) => {
  const x = clamp(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};
export const easeOut = (t: number) => 1 - Math.pow(1 - clamp(t), 3);
/** 帧率无关的指数趋近：dt 变化时结果一致 */
export const damp = (cur: number, target: number, lambda: number, dt: number) =>
  lerp(cur, target, 1 - Math.exp(-lambda * dt));

export class Emitter<T extends Record<string, unknown>> {
  private map = new Map<keyof T, Array<(p: unknown) => void>>();
  on<K extends keyof T>(k: K, fn: (p: T[K]) => void): () => void {
    const arr = this.map.get(k) ?? [];
    arr.push(fn as (p: unknown) => void);
    this.map.set(k, arr);
    return () => {
      const a = this.map.get(k) ?? [];
      const i = a.indexOf(fn as (p: unknown) => void);
      if (i >= 0) a.splice(i, 1);
    };
  }
  emit<K extends keyof T>(k: K, p?: T[K]) {
    (this.map.get(k) ?? []).forEach((fn) => fn(p));
  }
}

export const fmt = (n: number, d = 0) => n.toFixed(d);
