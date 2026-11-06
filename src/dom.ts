export const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
export const rnd = (a: number, b: number) => a + Math.random() * (b - a);
export const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
export const smooth = (x: number, a: number, b: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
/** A seeded generator in [0, 1) (mulberry32), so placements are the same on every load. */
export function mulberry32(seed: number){
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0)/4294967296; };
}
