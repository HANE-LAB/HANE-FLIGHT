import * as THREE from 'three';
import { fxScene, glowTex, reduceMotion, scene } from './renderer';
import { toriiVert, toriiFrag, toriiLinesVert, toriiLinesFrag, lanternVert, lanternFrag, glowVert, glowFrag, gateFeatherVert, gateFeatherFrag } from './shaders';
import { FIRE, FIRE_AT, PLUME_ASPECT, plumeTex } from './plume';
import { U, sceneUniforms } from './uniforms';
import { S_END, atDay, sAt, sideAt } from './path';
import { JUMP, LAST_DAY, NG, NIGHTS, SLOTS, SPECIAL_DAYS } from './data';
import { FEATHER, buildFarRed, buildFarWood, buildLantern, buildRedTorii, buildWoodTorii, linesOf } from './toriimodel';
import { smooth } from './dom';
import { paceNow, seq } from './sequencer';
import { GATE_RISE } from './clouds';
import { plaqueCode, plaqueTex } from './plaque';
import { CELLS_WIDTH, INK_GX, INK_GY, WRITING, inkAverage, inkTex, writeGates } from './writing';

/* =====================================================================
   GATES — one torii per night she streamed, standing along the flight line, and she flies through them. Each condenses out of
   the cloud a little ahead of her and stands where it comes: cloud gathers on its lines (src/spill.ts, clouds.frag.glsl), it
   takes shape the colour of cloud, its lantern catches, and fire runs out along it from the lantern and leaves it vermilion.
   The cloud could do this and the sea could not: Voyage's gates come up out of the water; these are made of the cloud and lit
   by her.
   Three grades of gate (src/toriimodel.ts): nights known only from her notices are unpainted wood (神明鳥居), as in HANE and
   Voyage; archived nights are Fushimi Inari's vermilion senbon torii (稲荷鳥居); the big nights the same, dressed in gilt,
   with a rope and paper and a crest of fire feathers. A paper lantern hangs under each tie beam, brighter the more the chat
   cheered.
   What a gate shows is a function of how far ahead of her it is (updateGates), so a seek, a pause or any speed gives the
   same picture.
   ===================================================================== */
const GATE_H = 24;                              // world height of the top beam for a night of usual length
/** The height of the last gate (the camera frames the sun in it). */
export const LAST_H = 46;

/* ---------- per gate ---------- */
export const iA = new Float32Array(NG*4);   // x, y, z of the foot's centre; yaw
export const iB = new Float32Array(NG*4);   // height, what its plaque says, kind (0 plain wood, 1 vermilion, 2 with fire feathers), the night's day
export const iC = new Float32Array(NG*2);   // how far it has come up (0 … 1 up, on to 2 as the cloud lets go), lantern (0…1): written every frame
export const iD = new Float32Array(NG*4), iE = new Float32Array(NG*4);   // what is written on its posts (src/writing.ts)
const iG = new Float32Array(NG*3);    // what her passing does to what hangs from it (blow, below): written every frame
const DM = new Float32Array(NG);      // how bright its lantern burns, from the chat
{
  const p = new THREE.Vector3(), s = new THREE.Vector3();
  const maxDm = Math.max(...NIGHTS.map(n => n.dm));
  for (let i = 0; i < NG; i++){
    const slot = SLOTS[i], n = slot.night;
    atDay(slot.day, p); sideAt(slot.day, s);
    const dur = n ? n.durH : 0, last = i === NG - 1;
    // its height is how long she streamed that night; and from the night the count jumps each stands taller than the last.
    // The last gate is the tallest and always the painted, feathered kind, whatever the archive knows of that night
    let h = GATE_H*(n ? 0.86 + 0.50*Math.min(1, Math.max(0, dur - 0.5)/7.5) + 0.12*Math.min(1, Math.max(0, dur - 8)/10) : 0.80)*(1 + 0.6*smooth(slot.day, JUMP - 3, JUMP + 15));
    if (last) h = Math.max(h, LAST_H);
    iA[i*4] = p.x; iA[i*4 + 1] = p.y; iA[i*4 + 2] = p.z; iA[i*4 + 3] = Math.atan2(s.z, s.x);
    iB[i*4] = h; iB[i*4 + 1] = plaqueCode(i); iB[i*4 + 2] = last ? 2 : !n ? 0 : SPECIAL_DAYS.has(slot.day) ? 2 : 1; iB[i*4 + 3] = slot.day;
    DM[i] = n ? 0.35 + 0.65*Math.log1p(n.dm)/Math.log1p(maxDm) : 0.25;
  }
}
const cellsTex = writeGates(i => iB[i*4], iD, iE);
/* ---------- drawing only what is seen: each frame (cullGates, after the camera moves) the gates in view are sorted into
   near ones (the full gate, its lantern and glow), far ones (the plain far gate) and, nearest, those that get an ink
   line. ---------- */
type Att = THREE.InstancedBufferAttribute;
type DrawSet = { A: Float32Array; B: Float32Array; C: Float32Array; D: Float32Array; E: Float32Array; G: Float32Array; a: Att; b: Att; c: Att; d: Att; e: Att; g: Att; geos: THREE.InstancedBufferGeometry[]; n: number; was: number; ids: Int32Array; moved: boolean };
const makeSet = (): DrawSet => {
  const att = (a: Float32Array, k: number) => new THREE.InstancedBufferAttribute(a, k).setUsage(THREE.DynamicDrawUsage);
  const A = new Float32Array(NG*4), B = new Float32Array(NG*4), C = new Float32Array(NG*2), D = new Float32Array(NG*4), E = new Float32Array(NG*4), G = new Float32Array(NG*3);
  return { A, B, C, D, E, G, a: att(A, 4), b: att(B, 4), c: att(C, 2), d: att(D, 4), e: att(E, 4), g: att(G, 3), geos: [], n: 0, was: 0, ids: new Int32Array(NG).fill(-1), moved: false };
};
// NEAR: every near gate, for the lanterns; then each grade's own near, far and outlined sets
const NEAR = makeSet(), NEAR_R = makeSet(), NEAR_W = makeSet(), FAR_R = makeSet(), FAR_W = makeSet(), LINE_R = makeSet(), LINE_W = makeSet();
const SETS = [NEAR, NEAR_R, NEAR_W, FAR_R, FAR_W, LINE_R, LINE_W];
const bind = (set: DrawSet, g: THREE.InstancedBufferGeometry) => { g.setAttribute('iA', set.a); g.setAttribute('iB', set.b); g.setAttribute('iC', set.c); g.setAttribute('iD', set.d); g.setAttribute('iE', set.e); g.setAttribute('iG', set.g); g.instanceCount = 0; set.geos.push(g); return g; };
{
  const mat = new THREE.ShaderMaterial({ uniforms: { ...sceneUniforms(), tDates: { value: plaqueTex }, tInk: { value: inkTex }, tCells: { value: cellsTex }, uInkMean: { value: inkAverage() }, uLent: U.uLent }, defines: { WRITING: WRITING ? 1 : 0, INK_GX: INK_GX.toFixed(1), INK_GY: INK_GY.toFixed(1), CELLS_W: CELLS_WIDTH }, vertexColors: true, alphaToCoverage: true, vertexShader: toriiVert, fragmentShader: toriiFrag });
  const lineMat = new THREE.ShaderMaterial({ uniforms: { ...sceneUniforms(), uLineW: { value: 2.0 } }, side: THREE.BackSide, alphaToCoverage: true, vertexShader: toriiLinesVert, fragmentShader: toriiLinesFrag });
  const instanced = (base: THREE.BufferGeometry, keys: string[]) => { const g = new THREE.InstancedBufferGeometry(); for (const k of keys) g.setAttribute(k, base.getAttribute(k)); return g; };
  const KEYS = ['position', 'normal', 'color', 'aPart'];
  const add = (set: DrawSet, base: THREE.BufferGeometry) => { const m = new THREE.Mesh(bind(set, instanced(base, KEYS)), mat); m.frustumCulled = false; scene.add(m); return m; };
  const red = buildRedTorii(), wood = buildWoodTorii();
  add(NEAR_R, red); add(NEAR_W, wood); add(FAR_R, buildFarRed()); add(FAR_W, buildFarWood());
  // ink outline (inverted hull) in a dark shade of what it outlines (色トレス), only on gates big on screen
  for (const [set, base] of [[LINE_R, red], [LINE_W, wood]] as const){
    const m = new THREE.Mesh(bind(set, instanced(linesOf(base), ['position', 'aOutN', 'aPart'])), lineMat); m.frustumCulled = false; scene.add(m);
  }
}
/** How thick the mist is now (src/clouds.ts sets it): the lantern glows die with it. */
export const GLOW_MIST = { value: 0 };
/* ---------- paper lanterns (提灯) under the tie beams, and their glow ---------- */
{
  const L = buildLantern(), g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(L.P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(L.N, 3)); g.setAttribute('aBlack', new THREE.Float32BufferAttribute(L.K, 1));
  bind(NEAR, g);
  const lan = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: sceneUniforms(), side: THREE.DoubleSide, alphaToCoverage: true, vertexShader: lanternVert, fragmentShader: lanternFrag }));
  lan.frustumCulled = false; scene.add(lan);
  // the glow: one camera-facing card per lantern, additive, above the bloom threshold where it burns brightest
  const q = new THREE.InstancedBufferGeometry();
  q.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  bind(NEAR, q);
  const glow = new THREE.Mesh(q, new THREE.ShaderMaterial({ uniforms: { ...sceneUniforms(), uTex: { value: glowTex }, uMist: GLOW_MIST }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexShader: glowVert, fragmentShader: glowFrag }));
  glow.frustumCulled = false; fxScene.add(glow);
}
/* ---------- 火羽: the gates of the big nights wear a pair of fire feathers, as HANE's warmest gates do, set in the middle of
   the top beam, leaning out, their tips turning back toward the middle ---------- */
{
  // a pair rising from the middle of the top beam, as in HANE and Voyage, each a strip bent like a flame: it leaves its socket
  // leaning out and turns back toward the middle at the tip. The strip starts inside the socket (src/toriimodel.ts), with its
  // quill on the socket's axis
  const P: number[] = [], UV: number[] = [];
  const K = 10;
  for (const s of [-1, 1]){
    const L = FEATHER.len, W = L/PLUME_ASPECT, tilt = FEATHER.tilt;
    let x = s*FEATHER.x, y = FEATHER.y;
    const rows: number[][] = [];
    for (let i = 0; i <= K; i++){
      const u = i/K, th = tilt*(1 - 1.7*u*u);                   // lean from the vertical, out (s) then in
      const ax = s*Math.sin(th), ay = Math.cos(th), cx = -s*Math.cos(th), cy = Math.sin(th);   // along, and across toward the middle
      const mx = x + cx*W*0.08, my = y + cy*W*0.08;             // (the quill lies a little off the card's middle)
      rows.push([mx - cx*W/2, my - cy*W/2, mx + cx*W/2, my + cy*W/2, u]);
      x += ax*L/K; y += ay*L/K;
    }
    for (let i = 0; i < K; i++){
      const [a0x, a0y, b0x, b0y, u0] = rows[i], [a1x, a1y, b1x, b1y, u1] = rows[i + 1];
      P.push(a0x, a0y, 0, a1x, a1y, 0, b1x, b1y, 0, a0x, a0y, 0, b1x, b1y, 0, b0x, b0y, 0);
      UV.push(u0, 0, u1, 0, u1, 1, u0, 0, u1, 1, u0, 1);
    }
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
  const mat = new THREE.ShaderMaterial({ uniforms: { ...sceneUniforms(), tPlume: { value: plumeTex }, uFire: { value: FIRE }, uFireAt: { value: FIRE_AT } }, side: THREE.DoubleSide, alphaToCoverage: true, vertexShader: gateFeatherVert, fragmentShader: gateFeatherFrag });
  // on the near gates and the far ones alike: from far off the pairs are the warm sparks that mark the big nights
  for (const [set, geo] of [[NEAR_R, g.clone()], [FAR_R, g]] as const){ const m = new THREE.Mesh(bind(set, geo), mat); m.frustumCulled = false; scene.add(m); }
}

/* ---------- her passing, on what hangs from a gate. The air she pushes ahead of her leans a lantern on the way she is going as she comes up (it is light, the air has it at once);
   when she has gone under it is let go, and swings back as a pendulum does, at sqrt(g/L), dying away in a few seconds. Worked out whole each frame, not stepped, so no frame rate changes
   it (Juckett's and Holden's analytic spring): all it keeps is when she went under. Harder the more of them there are, for the flock comes through after her; less the higher it hangs over
   her; a little less when she is slow, but not much, since that is when it can be seen: at her full speed the lens goes under it a fifth of a second after she does. ---------- */
const GUST_REACH = 34, GUST_DIES = 2.6, STIR_DIES = 1.1;
const wentAt = new Float32Array(NG).fill(-1e6);
let gone = 0, lastS = -1e9, lastT = 0, coming = 1;
function blow(u: number, s: number, birds: number){
  iG.fill(0);
  const t = U.uTime.value;
  // (the air she pushes ahead of her only while she is coming: stopped in front of a gate, what hangs from it settles)
  coming += ((seq.playing ? 1 : 0) - coming)*(1 - Math.exp(-(t - lastT)/0.5)); lastT = t;
  // (back, or a long way on at once, as a seek does: nothing was blown)
  if (s < lastS - 0.5 || s - lastS > 150){ gone = 0; while (gone < NG && iA[gone*4 + 2] <= s) gone++; wentAt.fill(-1e6); }
  lastS = s;
  const v = paceNow(u)*(sAt(u + 0.02) - sAt(u - 0.02))/0.04;
  for (; gone < NG && iA[gone*4 + 2] <= s; gone++) wentAt[gone] = t - (s - iA[gone*4 + 2])/Math.max(v, 1);
  if (reduceMotion) return;
  const hard = (0.09 + 0.06*Math.log10(1 + birds))*(0.6 + 0.4*Math.min(1, v/75));
  const reach = (i: number) => { const over = (0.515*iB[i*4] - 7.2)/14; return hard/(1 + over*over); };
  for (let i = gone; i < NG; i++){
    const z = (iA[i*4 + 2] - s)/GUST_REACH;
    if (z >= 1) break;
    const k = 1 - z*z, g = k*k*k*coming;
    iG[i*3] = reach(i)*g; iG[i*3 + 1] = (iB[i*4 + 3]%2 ? 0.7 : -0.7)*reach(i)*g; iG[i*3 + 2] = g;
  }
  for (let i = gone - 1; i >= 0; i--){
    const a = t - wentAt[i];
    if (a > 4*GUST_DIES) break;
    const om = Math.sqrt(9.8/(0.14*iB[i*4])), e = reach(i)*Math.exp(-a/GUST_DIES);
    // (from behind, where the lens is, a swing along the line hardly shows: so it goes to one side as well, and the two beat a little apart)
    iG[i*3] = e*Math.cos(om*a); iG[i*3 + 1] = (iB[i*4 + 3]%2 ? 0.7 : -0.7)*e*Math.cos(1.07*om*a); iG[i*3 + 2] = Math.exp(-a/STIR_DIES);
  }
}

const RISE_AT = GATE_RISE.at, RISE_AT_BIG = GATE_RISE.atBig, RISE_LEN = GATE_RISE.len;
/** Gates still coming into being this frame, nearest her first: src/spill.ts and the clouds gather cloud on them. */
export const rising: number[] = [];
const firstGateAt = (day: number) => { let lo = 0, hi = NG; while (lo < hi){ const m = (lo + hi) >> 1; if (SLOTS[m].day < day) lo = m + 1; else hi = m; } return lo; };
let upTo = 0;
/** How far along the line (world z) the gates have taken shape: lanterns' light on the cloud stops there. */
export const gatesTo = () => upTo;
/** The gate being read (src/camera.ts): it lets go of its cloud as the lens comes up to it, wherever she stopped. */
export const readHold = { i: -1, k: 0 };
/** Recompute every gate from where she is: how far it has come into being, and its lantern. A pure function of her day, but for the gate being read. */
export function updateGates(u: number, birds: number){
  rising.length = 0;
  const near = firstGateAt(Math.min(u, LAST_DAY - 22) - 8), s = sAt(u);
  upTo = Math.min(s + RISE_AT - RISE_LEN*0.8, S_END);
  blow(u, s, birds);
  // (those she has long passed stand; those far ahead are not up yet)
  iC.fill(0, near*2); for (let i = 0; i < near; i++){ iC[i*2] = 2; iC[i*2 + 1] = DM[i]; }
  for (let i = near; i < NG; i++){
    const x = sAt(SLOTS[i].day) - s;
    const at = iB[i*4 + 2] > 1.5 ? RISE_AT_BIG : RISE_AT;
    if (x > RISE_AT_BIG + 1) break;
    let q = Math.min(2, Math.max(0, (at - x)/RISE_LEN));
    // the last nights' gates go back to cloud in her wake, so at the end the last one stands alone with the sun in it
    if (seq.film && i < NG - 1 && SLOTS[i].day > LAST_DAY - 22) q = Math.min(q, 2*(1 - smooth(-x, 50, 170)));
    if (i === readHold.i) q = Math.max(q, 2*readHold.k);
    if (q <= 0) continue;
    iC[i*2] = q;
    // the lantern catches as it stands, and flares as she goes through; the last gate hangs none (-1): the sun coming up
    // through it is its light
    iC[i*2 + 1] = seq.film && i === NG - 1 ? -1 : DM[i]*smooth(q, 0.42, 0.62)*(1 + 1.3*Math.exp(-x*x/220));
    if (q < 2 && x > -8) rising.push(i);
  }
}
const frustum = new THREE.Frustum(), pv = new THREE.Matrix4(), sph = new THREE.Sphere();
const NEAR_D = 520, FAR_D = 3000, LINE_D = 240;
/** Sort the gates in view into the near, far and outlined sets for this frame (after updateGates and the camera). */
export function cullGates(cam: THREE.PerspectiveCamera){
  pv.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); frustum.setFromProjectionMatrix(pv);
  for (const t of SETS){ t.was = t.n; t.n = 0; t.moved = false; }
  const cx = cam.position.x, cy = cam.position.y, cz = cam.position.z;
  // (what a gate is does not change: only when the list of gates in view has, a few times a second, does it have to go up again. How far it has come and her wind do, every frame)
  const put = (t: DrawSet, i: number) => {
    const n = t.n++;
    if (t.ids[n] !== i){ t.ids[n] = i; t.moved = true; t.A.set(iA.subarray(i*4, i*4 + 4), n*4); t.B.set(iB.subarray(i*4, i*4 + 4), n*4); t.D.set(iD.subarray(i*4, i*4 + 4), n*4); t.E.set(iE.subarray(i*4, i*4 + 4), n*4); }
    t.C[n*2] = iC[i*2]; t.C[n*2 + 1] = iC[i*2 + 1]; t.G[n*3] = iG[i*3]; t.G[n*3 + 1] = iG[i*3 + 1]; t.G[n*3 + 2] = iG[i*3 + 2];
  };
  for (let i = 0; i < NG; i++){
    if (iC[i*2] <= 0) continue;   // not up yet
    const dz = iA[i*4 + 2] - cz;
    if (dz < -FAR_D || dz > FAR_D) continue;
    const h = iB[i*4];
    sph.center.set(iA[i*4], iA[i*4 + 1] + h*0.5, iA[i*4 + 2]); sph.radius = h*0.75;
    if (!frustum.intersectsSphere(sph)) continue;
    const d = Math.hypot(sph.center.x - cx, sph.center.y - cy, sph.center.z - cz);
    const wood = iB[i*4 + 2] < 0.5;
    if (d < NEAR_D){ put(NEAR, i); put(wood ? NEAR_W : NEAR_R, i); if (d < LINE_D) put(wood ? LINE_W : LINE_R, i); }
    else if (d < FAR_D) put(wood ? FAR_W : FAR_R, i);
  }
  const send = (att: Att, n: number) => { att.clearUpdateRanges(); att.addUpdateRange(0, n*att.itemSize); att.needsUpdate = true; };
  for (const t of SETS){
    if (t.n === t.was && t.n === 0) continue;
    if (t.moved) for (const att of [t.a, t.b, t.d, t.e]) send(att, t.n);
    if (t.n > 0){ send(t.c, t.n); send(t.g, t.n); }
    for (const g of t.geos) g.instanceCount = t.n;
  }
}
