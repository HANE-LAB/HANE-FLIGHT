import * as THREE from 'three';
import { camera, fxScene, reduceMotion } from './renderer';
import { airFrag, airVert, boltFrag, boltVert } from './shaders';
import { U, pick } from './uniforms';
import { mulberry32 } from './dom';
import { W, lend } from './season';
import { iA, iB, iC, rising } from './gates';
import { BOLT_H, BOLT_W, BoltGrowth } from './lightning';
import { WIND_A, WIND_K, gust, gustPath } from './wind';

/* =====================================================================
   WEATHER — what the climate (src/season.ts) puts in the air, so that it can be told at a glance, not only by its colour: petals
   in the warm years, rain and lightning in the storm, heavy snow in the cold, all moved by the one wind (src/wind.ts).
   ===================================================================== */

/* ---------- each kind is a box of air wrapped round the lens (air.vert.glsl). They fall and blow with the sim clock, and are carried
   along with her: if she went through them at her full speed they would only be lines ---------- */
const LAMPS = [new THREE.Vector4(0, -1e4, 0, 0), new THREE.Vector4(0, -1e4, 0, 0), new THREE.Vector4(0, -1e4, 0, 0)];
const air = (kind: number, n: number, box: THREE.Vector3, seed: number) => {
  const q = new THREE.PlaneGeometry(1, 1), g = new THREE.InstancedBufferGeometry();
  g.setIndex(q.getIndex()); g.setAttribute('position', q.getAttribute('position'));
  const r = mulberry32(seed), S = new Float32Array(n*4);
  for (let i = 0; i < n*4; i++) S[i] = r();
  g.setAttribute('aS', new THREE.InstancedBufferAttribute(S, 4)); g.instanceCount = n;
  const u = {
    uBox: { value: box }, uShift: { value: new THREE.Vector3() }, uVel: { value: new THREE.Vector3() }, uFallT: { value: 0 }, uStreak: { value: 0 }, uAmount: { value: 0 }, uStir: { value: 1 }, uWindU: { value: new THREE.Vector3() },
    uWindK: { value: WIND_K }, uWindA: { value: WIND_A }, uLamp: { value: LAMPS }, uLight: U.uMoonDir, ...pick('uPx', 'uTime', 'uBird', 'uWake', 'uCloudLit', 'uFlash', 'uDawn'),
  };
  const m = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: u, defines: { KIND: kind }, vertexShader: airVert, fragmentShader: airFrag, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor }));
  m.frustumCulled = false; m.visible = false; fxScene.add(m);
  return { m, u, n, prev: new THREE.Vector3(), prevFall: 0 };
};
const snow = air(0, 4200, new THREE.Vector3(80, 50, 100), 211);
const rain = air(1, 5200, new THREE.Vector3(70, 50, 90), 317);
const petals = air(2, 1100, new THREE.Vector3(70, 40, 90), 419);
/** A device that cannot keep up (src/main.ts): how much of each is in the air. */
export const setAirKeep = (k: number) => { for (const a of [snow, rain, petals]) (a.m.geometry as THREE.InstancedBufferGeometry).instanceCount = Math.round(a.n*k); };

/* ---------- a lightning channel: its shape comes from src/lightning.ts, laid out once per strike as a sheet facing the lens as it was
   then, each segment a ribbon. It only lasts a moment. The stepped leader creeps down dim and branching, in the order its cells
   joined; then the return stroke lights the main channel ---------- */
const SEGS = 560, bP = new Float32Array(SEGS*18), bV = new Float32Array(SEGS*18);
const boltU = { uBoltA: { value: 0 }, uLeadA: { value: 0 }, uLead: { value: 1 } };
const bolt = (() => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(bP, 3).setUsage(THREE.DynamicDrawUsage)); g.setAttribute('aV', new THREE.BufferAttribute(bV, 3).setUsage(THREE.DynamicDrawUsage));
  const m = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: boltU, vertexShader: boltVert, fragmentShader: boltFrag, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  m.frustumCulled = false; m.visible = false; fxScene.add(m);
  return m;
})();
const a = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3(), e = new THREE.Vector3();
let segs = 0, boltShown = -1;
function seg(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, w: number, br: number, t: number){
  if (segs >= SEGS) return;
  // across the channel, in the plane facing the lens
  a.set(x0, y0, z0); b.set(x1, y1, z1); d.copy(b).sub(a); e.copy(a).sub(camera.position); d.cross(e).normalize().multiplyScalar(w);
  const p = [x0 - d.x, y0 - d.y, z0 - d.z, x0 + d.x, y0 + d.y, z0 + d.z, x1 + d.x, y1 + d.y, z1 + d.z, x0 - d.x, y0 - d.y, z0 - d.z, x1 + d.x, y1 + d.y, z1 + d.z, x1 - d.x, y1 - d.y, z1 - d.z];
  bP.set(p, segs*18); bV.set([-1, br, t, 1, br, t, 1, br, t, -1, br, t, 1, br, t, -1, br, t], segs*18); segs++;
}
// the next strike's bolt, growing a little each frame so that no frame pays for all of it
const growing = new Map<number, BoltGrowth>();
const boltFor = (k: number) => { let g = growing.get(k); if (!g){ g = new BoltGrowth(k*7919 + 17); growing.set(k, g); if (growing.size > 6) growing.delete(growing.keys().next().value as number); } return g; };
function layBolt(k: number){
  const seed = k*7919 + 17, B = boltFor(k).now(), top = W.boltTop, c = (top - 2)/BOLT_H, r = mulberry32(seed + 5);
  e.set(W.boltX, 0, W.boltZ).sub(camera.position).setY(0).normalize();
  const sx = e.z, sz = -e.x, X = new Float32Array(B.n), Y = new Float32Array(B.n), Z = new Float32Array(B.n);
  for (let i = 0; i < B.n; i++){ const o = (B.x[i] - BOLT_W/2)*c, depth = 6*(r() - 0.5); X[i] = W.boltX + sx*o + e.x*depth; Y[i] = top - B.y[i]*c; Z[i] = W.boltZ + sz*o + e.z*depth; }
  segs = 0;
  for (let i = 0; i < B.n; i++){ const p = B.parent[i]; if (p >= 0) seg(X[p], Y[p], Z[p], X[i], Y[i], Z[i], 2.1*B.wide[i], B.bright[i], B.order[i]); }
  const g = bolt.geometry, pa = g.getAttribute('position') as THREE.BufferAttribute, va = g.getAttribute('aV') as THREE.BufferAttribute;
  pa.needsUpdate = va.needsUpdate = true; g.setDrawRange(0, segs*6);
}
const sh = new THREE.Vector3(), rel = new THREE.Vector3(), prevCam = new THREE.Vector3();
/** A strike asked for, reading a post or stopped at a gate (借一道闪电): it comes down beside what the lens is looking at, and its light stays until it is given back. */
export function lendFlash(on: boolean){
  if (on){
    camera.getWorldDirection(d);
    const far = 190, off = 0.62*Math.tan(camera.fov*Math.PI/360)*far*camera.aspect;
    W.boltX = camera.position.x + d.x*far + d.z*off; W.boltZ = camera.position.z + d.z*far - d.x*off; W.boltTop = 170;
  }
  lend(on);
}
/** One kind of air, per frame: how much of it, where its box is, and the way it crosses the lens. */
function blow(k: ReturnType<typeof air>, amount: number, wind: number, gusts: number, fall: number, carry: number, stir: number, streak: number, most: number, simT: number, s: number){
  k.m.visible = amount > 0.002 && !reduceMotion;
  if (!k.m.visible) return;
  k.u.uAmount.value = amount; k.u.uStir.value = stir*(1 + 0.45*gust(simT*0.7)); k.u.uWindU.value.set(wind, 0, 0);
  sh.set(wind*simT + gusts*gustPath(simT), 0, -0.8*simT + carry*s);
  rel.copy(sh).sub(k.prev).add(prevCam).sub(camera.position);
  k.prev.copy(sh); k.u.uShift.value.copy(sh);
  const fallT = fall*simT, df = Math.abs(fallT - k.prevFall); k.prevFall = fallT;
  k.u.uFallT.value = fallT;
  // (at a pause, or on a jump, the fall's own way, so rain is still rain)
  if (rel.lengthSq() > 900 || rel.lengthSq() < 0.0004) rel.set(wind/60, 0, 0);
  rel.multiplyScalar(streak);
  k.u.uVel.value.copy(rel.lengthSq() > most*most ? rel.setLength(most) : rel);
  k.u.uStreak.value = (df > 0 && df < 20 ? df : Math.abs(fall)/60)*streak;
}
/** Per frame, after the camera. @param s how far she has flown (m); @param simT the sim clock */
export function updateWeather(s: number, simT: number){
  U.uSnow.value = W.cold; U.uWet.value = W.rain;
  U.uWind.value = (0.15*W.sprout + 0.28*W.warm + 0.10*W.clear + W.storm + 0.45*W.cold + 0.15*W.thaw + 0.28*W.air)*(1 + 0.4*gust(simT));
  // the nearest lanterns, for what they light in the air
  for (let k = 0; k < 3; k++){ const i = rising[k], L = LAMPS[k]; if (i === undefined) L.w = 0; else L.set(iA[i*4], iA[i*4 + 1] + 0.515*iB[i*4], iA[i*4 + 2], Math.max(0, iC[i*2 + 1])); }
  blow(snow, W.cold, -3, 2.5, -4.6, 0.75, 3.0, 0.8, 3, simT, s);
  blow(rain, W.rain, -11, 7, -34, 0.72, 0.7, 3.4, 8, simT, s);
  blow(petals, W.warm + 0.22*W.sprout + 0.7*W.air, -2.5, 3.5, -1.5, 0.88, 5.0, 0, 0, simT, s);
  prevCam.copy(camera.position);

  if (W.storm > 0.01 && !reduceMotion) boltFor(W.nextBolt).step(40);
  // the lightning's light on the gates comes from where it is
  const f = W.flash, stays = 0.30*W.lent;
  U.uLent.value = W.lent;
  if (f > stays){ d.set(W.boltX, 0.5*W.boltTop, W.boltZ).sub(camera.position).normalize(); U.uFlash.value.set(d.x, d.y, d.z, f); }
  // (the light that stays comes from over the lens's shoulder, so that the face being read has it)
  else if (stays > 0.001){ d.set(0.4, 0.7, -0.6).normalize(); U.uFlash.value.set(d.x, d.y, d.z, stays); }
  else U.uFlash.value.w = 0;
  if (W.bolt !== boltShown){
    boltShown = W.bolt; bolt.visible = boltShown >= 0;
    if (boltShown >= 0) layBolt(boltShown);
  }
  if (boltShown >= 0){
    const far = Math.exp(-Math.hypot(W.boltX - camera.position.x, W.boltZ - camera.position.z)/1000);
    if (W.lead < 1){ boltU.uLead.value = W.lead; boltU.uLeadA.value = 0.30*far; boltU.uBoltA.value = 0; }
    else { boltU.uLead.value = 1.01; boltU.uLeadA.value = 0; boltU.uBoltA.value = Math.min(1, 1.6*f)*far; }
  }
}
