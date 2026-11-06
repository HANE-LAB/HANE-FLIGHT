import * as THREE from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { fxScene, scene } from './renderer';
import { flockFrag, flockVert, highFrag, highVert, wakeFrag, wakeVert } from './shaders';
import { FIRE, FIRE_AT, ROSE, goldOf, plumeTex, tintsOf } from './plume';
import { GUARDS, LAST_DAY, NDAYS, NG, ROSTER, guardsAt } from './data';
import { S_END, sAt } from './path';
import { U } from './uniforms';
import { restAt, seq } from './sequencer';
import { mulberry32 } from './dom';
import { models } from './models';
import { iA, iB } from './gates';

/* =====================================================================
   FLOCK — her 舰长: one small bird for each person on board that day (the daily count Voyage collects). They fly beside her, out
   to either side and hardly behind (the lens is close behind her: what flies further back is never seen), with a thin stream down
   the middle. On the night the count jumps (2026-10-12: 531 → 4178) thousands come up out of the cloud to join her and they spread
   into a pair of wings of fire. Each bird's place is a formula (chunks/flock.glsl), so 9000 of them cost a few vertices each and no CPU.
   As in Voyage, rank shows in the model (art/bird/build.py) and rank comes first, and it should tell at a glance. The 总督, however many there are that day, fly just off her wing
   tips: big, in a soft light, each its own gold, its own tail and crest. 提督 out through the whole of the wing: rose, long tailed. The 舰长 are the deep vermilion of the flock. Among them those longest with her fly closest, and those with her a month,
   half a year, a year or more (Voyage's tiers, B站's 陪伴天数, which counts earlier stints) go up through orange to pale gold, grow a long
   tail as she has, and carry a star, and from a year a wake with one bead of light running down it for each year (wake.*.glsl). Only today's
   list has ranks (no names or ids come here, docs/DATA.md): whoever else was there on a day long gone is a plain small bird.
   ===================================================================== */
const REF = 7200;                      // the count the formation is sized for: its arms reach ARM metres out there
const ARM = 120;
const NMAX = Math.max(REF, Math.ceil(Math.max(...GUARDS)*1.02));
/** How far they reach to each side with n birds, metres (the valley opens to take them in). */
export const reachOf = (n: number) => 4.5 + ARM*Math.pow(Math.sqrt(Math.max(n, 0)/REF), 1.15);
/** The 舰长 nearest her, whom the lens sees close: these have the most feathers, those longest with her first. Those next, out to NEAR1, have fewer; the rest are a shape. Held to a number, not to how many have reached a tier: on the night a whole year's newcomers reach their first month that would be thousands of models of a thousand vertices each, and those beyond it keep their star. */
const NEAR0 = Math.max(160, Math.min(ROSTER.vets.length, 200)), NEAR1 = NEAR0 + 420;
const iF = new Float32Array(NMAX*4);   // across (m, signed), behind her (m), above her (m), a seed
{
  const r = mulberry32(2021);
  for (let i = 0; i < NMAX; i++){
    const a = Math.sqrt((i + 1)/REF), s1 = r(), s2 = r(), s3 = r();
    let x: number, lag: number, y: number;
    if (i%5 === 4){   // the stream down the middle, through the gates with her
      lag = 7 + 460*a*a + 9*s1; x = (s2 - 0.5)*(2.6 + lag*0.09); y = (s3 - 0.5)*(1.8 + lag*0.05);
    } else {          // out to either side of her, hardly behind: they fly beside her, round the lens, a little raised toward the tips
      const side = i%2 ? 1 : -1, ax = 4.5 + ARM*Math.pow(a, 1.15);
      x = side*ax; lag = 1.0 + 0.22*ax + s1*s1*(4 + 0.50*ax); y = (s3 - 0.5)*(3.4 + 0.36*ax) + 0.05*ax;
    }
    iF.set([x, lag, y, s2], i*4);
  }
}
// (uGates: the gates about her, how far along the line and how tall: the birds keep out of the lines of their posts, chunks/flock.glsl. A bird starts on its lane up to
// LANE_AHEAD metres before a gate and is back off it up to LANE_BEHIND after; the birds that go round reach from just in front of her to 120 m behind)
const GATES_NEAR = 16, LANE_AHEAD = 187, LANE_BEHIND = 263, gatesNear = new Float32Array(GATES_NEAR*2);
const place = { uS: { value: 0 }, uSEnd: { value: S_END }, uRest: { value: 0 }, uAgo: { value: 0 }, uTime: U.uTime, uPx: U.uPx, uGates: { value: gatesNear }, uStroke: { value: new THREE.Vector2() } };
const fireU = { uFire: { value: FIRE }, uFireAt: { value: FIRE_AT }, uDawn: U.uDawn };
const uni = { ...place, ...fireU, uN: { value: 1 }, uBase: { value: NEAR1 } };
const inst = new THREE.InstancedBufferGeometry();
const mesh = new THREE.Mesh(inst, new THREE.ShaderMaterial({ uniforms: uni, side: THREE.DoubleSide, vertexShader: flockVert, fragmentShader: flockFrag }));
mesh.frustumCulled = false; scene.add(mesh);
inst.instanceCount = 0;
const near = [new THREE.InstancedBufferGeometry(), new THREE.InstancedBufferGeometry()];
near[0].instanceCount = near[1].instanceCount = 0;

/* ---------- 总督 and 提督 ---------- */
const NS = ROSTER.sou.length, NT = ROSTER.tei.length, NH = NS + NT;
const hF = new Float32Array(NH*4), hH = new Float32Array(NH*3);
// half a wingspan (m): the 舰长 are about 0.8. A tail's wake and a glow round them, by rank. The 总督 are the day's count, not a fixed number: each takes the next of the models
// (art/bird/build.py sou0 … sou7), which go round again after the eighth, and the next gold (plume.ts goldOf), which does not
const SOU_MODELS = 8, SOU_SIZE = [3.4, 3.2, 3.3, 3.4, 3.3, 3.4, 3.2, 3.3], TEI_SIZE = 1.9, KAN_SIZE = 0.78;
{
  const r = mulberry32(2026);
  const firstTei = 24 + 14*Math.ceil(NS/2);
  for (let i = 0; i < NH; i++){
    const sou = i < NS, k = sou ? i : i - NS, row = Math.floor(k/2), side = k%2 ? 1 : -1;
    // (the 总督, however many, off her wing tips and each above or below the last, so the lens close behind her has them all in the picture. Waiting at today they spread further: souOut, souUp in chunks/flock.glsl)
    const ax = sou ? 10 + 5*row : firstTei + 4.6*row;
    // (the 提督 spread out through the whole of the wing, each its own, not a line of them: every other one a little further back and higher)
    const out = !sou && row%2 ? 1 : 0;
    hF.set([side*ax, sou ? 2.6 + (row%2 ? -0.8 : 0.8)*row : 2 + 0.22*ax + 0.8*r() + 3.5*out, sou ? 0.7 + (row%2 ? 3.2 + 1.6*row : -1.1*row) : 1.2 + 0.045*ax + 2.2*(out - 0.5), r()], i*4);
    hH.set([sou ? SOU_SIZE[k%SOU_MODELS] : TEI_SIZE, sou ? ROSTER.sou[k] : ROSTER.tei[k], sou ? -2 - k : -1], i*3);
  }
}
const highU = { ...place, ...fireU, tPlume: { value: plumeTex }, uN: uni.uN };
// (rank: 0 a 舰长, 1 a 提督, 2 a 总督)
const highMat = (rank: number, ramp = ROSE) => new THREE.ShaderMaterial({ uniforms: { ...highU, uRank: { value: rank }, uRamp: { value: ramp } }, side: THREE.DoubleSide, vertexShader: highVert, fragmentShader: highFrag, alphaToCoverage: true });

/* ---------- the wakes: 总督, 提督, and the 舰长 who have reached a tier ---------- */
const NV = ROSTER.vets.length, NW = NH + NV;
const wF = new Float32Array(NW*4), wW = new Float32Array(NW*4);   // wW: days with her, how long its wake is at least, how wide its glow at least, its rank among the 舰长 (-1: not one)
wF.set(hF); for (let i = 0; i < NH; i++) wW.set([hH[i*3 + 1], i < NS ? 18 : 8, i < NS ? 8.0 : 2.6, i < NS ? -2 - i : -1], i*4);
wF.set(iF.subarray(0, NV*4), NH*4); for (let i = 0; i < NV; i++) wW.set([ROSTER.vets[i], 0, 0, i], (NH + i)*4);
const wake = new THREE.InstancedBufferGeometry();
{
  // a ribbon (position.z 0) and a soft quad for the glow (position.z 1)
  const SEG = 14, P: number[] = [], I: number[] = [];
  for (let i = 0; i <= SEG; i++){ P.push(i/SEG, -1, 0, i/SEG, 1, 0); if (i < SEG){ const a = i*2; I.push(a, a + 2, a + 3, a, a + 3, a + 1); } }
  const q = P.length/3;
  P.push(-1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1, 1); I.push(q, q + 1, q + 2, q, q + 2, q + 3);
  wake.setIndex(I); wake.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  wake.setAttribute('iF', new THREE.InstancedBufferAttribute(wF, 4)); wake.setAttribute('iW', new THREE.InstancedBufferAttribute(wW, 4));
  wake.instanceCount = NW;
}
const wakeMesh = new THREE.Mesh(wake, new THREE.ShaderMaterial({ defines: { NTINT: 2 + NS }, uniforms: { ...place, ...fireU, uN: uni.uN, uTint: { value: tintsOf(NS) } }, side: THREE.DoubleSide, transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, vertexShader: wakeVert, fragmentShader: wakeFrag }));
wakeMesh.frustumCulled = false; fxScene.add(wakeMesh);

/* ---------- the models ---------- */
const v = new THREE.Vector3();
/** A small bird's shape from the file, in floats in its own units: gltfpack leaves them quantized with the way back on the node. */
function shape(g: GLTF, name: string, into: THREE.BufferGeometry){
  let m: THREE.Mesh | undefined;
  g.scene.getObjectByName(name)!.traverse(o => { if ((o as THREE.Mesh).isMesh) m = o as THREE.Mesh; });
  const src = m!.geometry, p = src.getAttribute('position'), out = new Float32Array(p.count*3);
  for (let i = 0; i < p.count; i++){ v.fromBufferAttribute(p, i).applyMatrix4(m!.matrix); out.set([v.x, v.y, v.z], i*3); }
  into.setIndex(src.index); into.setAttribute('position', new THREE.BufferAttribute(out, 3));
  into.setAttribute('uv', src.getAttribute('uv')); into.setAttribute('uv1', src.getAttribute('uv1')); into.setAttribute('normal', src.getAttribute('normal'));
}
export const flockReady = models.then(g => {
  shape(g, 'kan', inst);
  inst.setAttribute('iF', new THREE.InstancedBufferAttribute(iF.subarray(NEAR1*4), 4));
  const nH = new Float32Array(NEAR1*3);
  for (let i = 0; i < NEAR1; i++) nH.set([KAN_SIZE, i < NV ? ROSTER.vets[i] : 0, i], i*3);
  const nearMat = highMat(0);
  ([['kan0', 0, NEAR0], ['kan1', NEAR0, NEAR1]] as const).forEach(([name, a, b], k) => {
    shape(g, name, near[k]);
    near[k].setAttribute('iF', new THREE.InstancedBufferAttribute(iF.subarray(a*4, b*4), 4));
    near[k].setAttribute('iH', new THREE.InstancedBufferAttribute(nH.subarray(a*3, b*3), 3));
    const m = new THREE.Mesh(near[k], nearMat); m.frustumCulled = false; scene.add(m);
  });
  const high = (name: string, at: number[], mat: THREE.ShaderMaterial) => {
    if (!at.length) return;
    const geo = new THREE.InstancedBufferGeometry();
    shape(g, name, geo);
    geo.setAttribute('iF', new THREE.InstancedBufferAttribute(new Float32Array(at.flatMap(i => [...hF.subarray(i*4, i*4 + 4)])), 4));
    geo.setAttribute('iH', new THREE.InstancedBufferAttribute(new Float32Array(at.flatMap(i => [...hH.subarray(i*3, i*3 + 3)])), 3));
    geo.instanceCount = at.length;
    const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; scene.add(m);
  };
  for (let k = 0; k < NS; k++) high(`sou${k%SOU_MODELS}`, [k], highMat(2, goldOf(k)));
  high('tei', Array.from({ length: NT }, (_, i) => NS + i), highMat(1));
});

/** How many birds are flying now. It eases toward that day's count, so a jump is a rush rather than a pop. */
export const flock = { n: 1 };
// (waiting at today, the count is today's, which can be a day past the last gate)
export const dayNow = (u: number) => !seq.film && u > LAST_DAY ? 1e9 : u;
export function snapFlock(u: number){ flock.n = guardsAt(dayNow(u)); }
/** @param ph the stroke her wings are on @param amp how deep (src/bird.ts): waiting at today the flock is the rest of her wings, and beats with them */
export function updateFlock(u: number, dt: number, ph: number, amp: number){
  const want = guardsAt(dayNow(u));
  // up fast enough that the night of the jump is a rush of seconds; down slower, as people leave
  flock.n += (want - flock.n)*(1 - Math.exp(-dt*(want > flock.n ? 1.2 : 0.7)));
  const ago = Math.max(0, NDAYS - 1 - dayNow(u));
  const s = sAt(u);
  place.uS.value = s; place.uRest.value = restAt(u); place.uAgo.value = ago; place.uStroke.value.set(ph, amp);
  // (those ahead and behind as far as any of them reaches: if gates stand closer than this holds, the furthest back goes, which only the birds far behind the lens are still near)
  let lo = 0, hi = NG; while (lo < hi){ const m = (lo + hi) >> 1; if (iA[m*4 + 2] <= s + 9 + LANE_AHEAD) lo = m + 1; else hi = m; }
  for (let k = 0; k < GATES_NEAR; k++){ const i = lo - 1 - k, on = i >= 0 && iA[i*4 + 2] > s - 120 - LANE_BEHIND; gatesNear[k*2] = on ? iA[i*4 + 2] : -1e6; gatesNear[k*2 + 1] = on ? iB[i*4] : 1; }
  // (the ranks on board that day are counted in that day's number)
  let high = 0; for (let i = 0; i < NH; i++) if (hH[i*3 + 1] >= ago) high++;
  const n = Math.max(0, flock.n - high);
  uni.uN.value = n;
  const count = Math.min(NMAX, Math.ceil(n*1.12) + 40);
  near[0].instanceCount = Math.min(NEAR0, count); near[1].instanceCount = Math.max(0, Math.min(NEAR1, count) - NEAR0); inst.instanceCount = Math.max(0, count - NEAR1);
}
