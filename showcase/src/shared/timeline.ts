/** Single source of truth for timing. Used by the web player AND the Remotion video. */
export const FPS = 30;
export const DURATION = 60;
export const SCENES = [
  { id: 'intro', start: 0, end: 5, label: 'Brand' },
  { id: 'owner', start: 5, end: 20, label: 'Gym owner' },
  { id: 'customer', start: 20, end: 35, label: 'Gym customer' },
  { id: 'trainer', start: 35, end: 48, label: 'Personal trainer' },
  { id: 'ecosystem', start: 48, end: 60, label: 'Ecosystem' },
] as const;
export type SceneId = (typeof SCENES)[number]['id'];

export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
/** progress 0..1 of t inside [a,b] */
export const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
export const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
export const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);
export const easeInOut = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
export const easeOutBack = (p: number) => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
};

/** fade/slide-in style for an element that appears at local time `at` */
export function reveal(t: number, at: number, dur = 0.7, dy = 24): React.CSSProperties {
  const p = easeOut(seg(t, at, at + dur));
  return { opacity: p, transform: `translate3d(0, ${(1 - p) * dy}px, 0)` };
}

export function sceneAt(t: number) {
  const tt = clamp(t, 0, DURATION - 1e-6);
  return SCENES.find((s) => tt >= s.start && tt < s.end) ?? SCENES[SCENES.length - 1];
}

/** mulberry32 – deterministic randomness so renders are frame-exact */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
