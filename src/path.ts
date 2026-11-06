import * as THREE from 'three';
import { GAP, LAST_DAY, NDAYS } from './data';
import { smooth } from './dom';
import { metresOf } from './climate';

/* =====================================================================
   PATH — the flight line through the cloud: a long, slow curve along +z, a few gate widths of sway. The gates stand on it, the
   bird flies through them and the flock trails along it, all by the same closed form, so the page and the shaders
   (src/shaders/chunks/path.glsl, keep the two the same) always agree. s is metres along z; sAt turns a day into it.
   Past the last gate the line climbs away into the sky: she flies on and up toward the sun.
   ===================================================================== */
// metres along the line at each day: the days go by faster or slower with the climate, she flies at the same speed
const LINE = (() => { const n = NDAYS + 400, a = new Float64Array(n); for (let d = 1; d < n; d++) a[d] = a[d - 1] + 0.5*(metresOf(d - 1, d - 1 >= LAST_DAY) + metresOf(d, d >= LAST_DAY)); return a; })();
/** Metres along the line at a (fractional) day. */
export const sAt = (u: number) => { const x = Math.max(0, Math.min(LINE.length - 2, u)), k = Math.floor(x); return LINE[k] + (LINE[k + 1] - LINE[k])*(x - k); };
/** The (fractional) day at so many metres along the line. */
export const dayAtS = (s: number) => { let lo = 0, hi = LINE.length - 1; while (hi - lo > 1){ const m = (lo + hi) >> 1; if (LINE[m] <= s) lo = m; else hi = m; } return lo + Math.max(0, Math.min(1, (s - LINE[lo])/Math.max(1e-6, LINE[hi] - LINE[lo]))); };
export const S_END = sAt(LAST_DAY);             // the last gate
export const pathX = (s: number) => 60*Math.sin(s/430 + 0.7) + 24*Math.sin(s/181 + 2.1);
export const pathY = (s: number) => 1.2*Math.sin(s/260 + 1.0) + 0.5*Math.sin(s/97);
export const pathDX = (s: number) => 60/430*Math.cos(s/430 + 0.7) + 24/181*Math.cos(s/181 + 2.1);
// past the last gate the line lifts away toward the rising sun, gently at first
export const climbAt = (s: number) => { const k = Math.max(0, s - S_END); return 0.075*k*k/(k + 60); };
/** How steeply the line has climbed past the last gate. */
const climbSlope = (s: number) => { const k = Math.max(0, s - S_END); return 0.075*k*(k + 120)/((k + 60)*(k + 60)); };

/** World position of a (fractional) day on the line, at the gates' feet. */
export const atDay = (d: number, out = new THREE.Vector3()) => { const s = sAt(d); return out.set(pathX(s), pathY(s) + climbAt(s), s); };
/** Unit tangent at a day. */
export const tangentAt = (d: number, out = new THREE.Vector3()) => { const s = sAt(d); return out.set(pathDX(s), climbSlope(s), 1).normalize(); };
/** Unit horizontal vector across the line. */
export const sideAt = (d: number, out = new THREE.Vector3()) => { const s = sAt(d); return out.set(1, 0, -pathDX(s)).normalize(); };
/** Curvature across the line (1/m, signed), for banking. */
export const bendAt = (d: number) => { const s = sAt(d); return -60/(430*430)*Math.sin(s/430 + 0.7) - 24/(181*181)*Math.sin(s/181 + 2.1); };

/* ---------- the acts, by day ---------- */
/** The two years the archive lost: inside the cloud, gates coming out of the mist one by one. 0 … 1 */
export const mistAt = (u: number) => smooth(u, GAP[0] - 30, GAP[0] + 25)*(1 - smooth(u, GAP[1] - 40, GAP[1] + 25));
/** Near the top of the cloud, from the end of the gap on: the towers lower, the moon clear, the valley wider. 0 … 1 */
export const aboveAt = (u: number) => smooth(u, GAP[1] - 60, GAP[1] + 110);
/** The way the sun will rise: straight along the line at the last gate, so it comes up through her last gate. */
export const EAST = (() => { const v = tangentAt(LAST_DAY); return new THREE.Vector3(v.x, 0, v.z).normalize(); })();
