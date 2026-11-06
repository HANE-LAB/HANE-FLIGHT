import * as THREE from 'three';
import { camera, fxScene, glowTex, reduceMotion, scene } from './renderer';
import { plumeFrag, plumeVert } from './shaders';
import { FACE_COLORS, FIRE, FIRE_AT, HAIR, KNOT_2022, ORN_COLORS, plumeTex } from './plume';
import { U } from './uniforms';
import { W } from './season';
import { smooth } from './dom';
import { models } from './models';
import { emberAt, flareAt, grownAt, moultAt, moultFront, pairLength } from './age';
import { KawaiiNode } from './kawaii/node.ts';
import { PoseSnapshot } from './kawaii/pose.ts';

/* =====================================================================
   BIRD — 火羽 as the long-crowing bird (長鳴鳥), made of HANE's fire feathers (src/plume.ts), never a realistic phoenix: she
   is her own light (no scene shading), vermilion at the roots and pale gold at the tips, so the tips glow.
   Her shape is a model (art/bird/, Blender, src/figures/bird.glb): one skinned mesh of some hundreds of feathers on about 750 bones. How
   she flies is here: the wing's stroke, sweep, twist and fold, which is a function of the climate (src/climate.ts); and what hangs
   from her bones, by KawaiiPhysics (src/kawaii/), which takes the pose each frame and lets the flight feathers, the coverts, the
   mane, the crest and the tail lag behind it, whip and take the wind. She grows up over the flight (src/age.ts): the same bones, scaled by the day.
   The bones are kept out of the scene, so three.js does not work them all out again for every render.
   ===================================================================== */
const qs = new URLSearchParams(location.search);
const fireU = { uFire: { value: FIRE }, uFireAt: { value: FIRE_AT } };
const mat = new THREE.ShaderMaterial({
  uniforms: { tPlume: { value: plumeTex }, ...fireU, uDawn: U.uDawn, uShowHang: { value: qs.get('physics') === 'show' ? 1 : 0 }, uRest: { value: new THREE.Matrix4() }, uEmber: U.uEmber, uYouth: { value: 0 }, uFlare: { value: 0 }, uFront: { value: new THREE.Vector2() }, uFaceC: { value: FACE_COLORS }, uOrnC: { value: ORN_COLORS }, uKnot: { value: new THREE.Vector3() }, uHairA: { value: new THREE.Vector3() }, uHairB: { value: new THREE.Vector3() }, uEye: { value: new THREE.Vector4(1, 0, 0, 0) }, uM1: { value: 0 } },
  vertexShader: plumeVert, fragmentShader: plumeFrag, side: THREE.DoubleSide, alphaToCoverage: true,
});

/** What main.ts places in the world: the mesh hangs from it. */
export const bird = new THREE.Group();
bird.scale.setScalar(2.6);
scene.add(bird);
// she is a light: a soft glow round her, drawn with the other effects after the cloud, so the cloud hides it as it hides her
export const birdGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(1.0, 0.50, 0.24), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.42 }));
birdGlow.scale.setScalar(9); fxScene.add(birdGlow);
/** How she carries herself now, for main.ts: nose up (added to the line's slope), buffeting (the roll), heaving (metres). */
export const flight = { pitch: 0.36, buffet: 0, heave: 0, glow: 1, ph: 0, amp: 0 };
/** Waiting at today she hangs on the wind, as a kite or a kestrel does: how far she has drifted (metres), how far she leans into it, and a little turn of her own. For main.ts. */
export const hover = { x: 0, y: 0, z: 0, lean: 0, yaw: 0 };

/* ---------- a joint: its pose is a turn given in her own axes as they stand at rest, whatever way the bone itself lies in the model ---------- */
type Joint = { b: THREE.Bone; q0: THREE.Quaternion; R: THREE.Quaternion; Ri: THREE.Quaternion };
const Q = new THREE.Quaternion(), D = new THREE.Quaternion(), E = new THREE.Euler(0, 0, 0, 'YZX'), V = new THREE.Vector3(), V2 = new THREE.Vector3(), S = new THREE.Vector3(), lerp = THREE.MathUtils.lerp;
function turn(j: Joint, rx: number, ry: number, rz: number){
  E.set(rx, ry, rz); D.setFromEuler(E);
  j.b.quaternion.copy(j.q0).multiply(Q.copy(j.Ri).multiply(D).multiply(j.R));
}
/** A feather's root turning as the wing folds (about the wing's up, by fold radians at full fold) and on its own quill (twist). */
type Fan = { j: Joint; fold: number; twist: number; up: THREE.Vector3; along: THREE.Vector3 };
type Wing = { s: number; shoulder: Joint; elbow: Joint; wrist: Joint; hand: Fan[]; arm: Fan[]; root: Fan[] };
// a pair of tail feathers: which year's, how far round it lies at rest, the joints along it and how long each is
type TailRoot = { j: Joint; i: number; yaw: number; along: THREE.Bone[]; seg: number; full: number };

/* ---------- what hangs from its bones ---------- */
// damping, stiffness, how little of her turning goes through (worldDampingRotation), limit in degrees; stiffness along the chain; gravity; how much wind it takes.
// A wing beats far slower than a spring this stiff rings, so a stiff feather simply tracks its pose: what bends it is air, so the flight feathers have much
// damping (it works on their speed in her frame, as the air does) and little stiffness, and trail behind the wing by about damping/stiffness frames of its motion
type Hang = [string, RegExp, number, number, number, number, [number, number][], number, number];
const HANGS: Hang[] = [
  ['flights', /^(pri|sec|ter)\d/, 0.26, 0.06, 0.60, 20, [[0, 2.0], [1, 0.6]], 0, 0.45],
  ['coverts', /^(gcp|gcs|gct|sca|man|utc)\d/, 0.20, 0.14, 0.80, 30, [[0, 1], [1, 1]], 0, 0.40],
  ['mane', /^(mane|lock|twin)/, 0.14, 0.09, 0.60, 35, [[0, 1.6], [1, 0.5]], 0.5, 0.45],
  ['worn', /^(tas|cord)/, 0.10, 0.06, 0.40, 40, [[0, 1.2], [1, 0.6]], 2.2, 0.5],
  ['crest', /^crest/, 0.12, 0.07, 0.50, 45, [[0, 1.6], [1, 0.5]], 0, 0.5],
];
// (each year's pair of tail feathers is a node of its own, so the pairs still to come cost nothing)
const TAIL_HANG: Hang = ['tail', /^$/, 0.09, 0.032, 0.30, 22, [[0, 3], [0.3, 1.2], [1, 0.7]], 1.6, 0.8];
let rig: THREE.Object3D, snapshot: PoseSnapshot, nodes: KawaiiNode[] = [], windK: number[] = [], tailNodes: KawaiiNode[] = [];
let body: Joint, neck1: Joint, neck2: Joint, headB: Joint, beakB: Joint, tailB: Joint, wings: Wing[], tailRoots: TailRoot[];
let priRoots: THREE.Bone[] = [], secRoots: THREE.Bone[] = [], crestRoots: THREE.Bone[] = [], maneRoots: THREE.Bone[] = [], utcRoots: THREE.Bone[] = [];
let knots: THREE.Bone[] = [], tassels: THREE.Bone[] = [], flowerB: THREE.Bone, cords: THREE.Bone[] = [], twins: THREE.Bone[] = [];
const neck2P = new THREE.Vector3(), headP = new THREE.Vector3();
const PHYSICS = qs.get('physics') !== '0';   // (?physics=0: the same flight with nothing hanging, to compare; ?physics=show: what hangs, tinted)
// (?straight, for recording: she looks where she is going and not at the lens, and drifts less, so she and the flock stay in line with each other)
const STRAIGHT = qs.has('straight');

/** Her model is ready: main.ts starts on this. */
export const birdReady = models.then(g => {
  const mesh = g.scene.getObjectByProperty('isSkinnedMesh', true) as unknown as THREE.SkinnedMesh;
  rig = g.scene.getObjectByName('rig')!;
  // (gltfpack leaves the positions quantized with the way back on the node: the shader reads where a vertex lies on her through this)
  mat.uniforms.uRest.value.copy(mesh.matrix);
  mesh.frustumCulled = false; mesh.material = mat; bird.add(mesh);
  g.scene.remove(rig);
  rig.updateWorldMatrix(true, true);
  const bones = mesh.skeleton.bones, by = new Map(bones.map(b => [b.name, b]));
  for (const b of bones) b.quaternion._onChange(() => {});
  const joint = (b: THREE.Bone): Joint => { const R = b.getWorldQuaternion(new THREE.Quaternion()); return { b, q0: b.quaternion.clone(), R, Ri: R.clone().invert() }; };
  const J = (n: string) => joint(by.get(n)!);
  body = J('body'); neck1 = J('neck1'); neck2 = J('neck2'); headB = J('head'); beakB = J('beak'); tailB = J('tail');
  neck2P.copy(neck2.b.position); headP.copy(headB.b.position);
  const fan = (b: THREE.Bone, fold: number, twist: number): Fan => {
    const j = joint(b), dir = S.set(0, 0, 0);
    // the way the quill runs at rest, from this joint to the next one (a one-joint covert: its own axis)
    const next = b.children.find(c => (c as THREE.Bone).isBone);
    if (next) next.getWorldPosition(dir).sub(b.getWorldPosition(V)); else dir.set(0, 1, 0).applyQuaternion(j.R);
    return { j, fold, twist, up: new THREE.Vector3(0, 1, 0).applyQuaternion(j.Ri), along: dir.clone().normalize().applyQuaternion(j.Ri) };
  };
  wings = (['L', 'R'] as const).map(sfx => {
    const s = sfx === 'L' ? 1 : -1, hand: Fan[] = [], arm: Fan[] = [], root: Fan[] = [];
    for (const b of bones){
      const m = /^(pri|gcp|mcp|ugp|alu|sec|gcs|mcs|lcs|ugs|mae|ume|ter|gct|mct|lct|ugt|sca|mas|ums)\d+_0_([LR])$/.exec(b.name);
      if (!m || m[2] !== sfx) continue;
      const g = m[1];
      if ('pri gcp mcp ugp alu'.includes(g)){
        // how far round from straight out the feather lies: on the hand they close up toward the hand's own line, the inner ones most
        const nb = b.children.find(c => (c as THREE.Bone).isBone);
        if (nb) nb.getWorldPosition(V).sub(b.getWorldPosition(V2)); else V.set(0, 1, 0).applyQuaternion(b.getWorldQuaternion(Q));
        const a = Math.atan2(-V.z, s*V.x);
        hand.push(fan(b, -0.74*Math.max(0, a - 0.15), g === 'pri' ? 1 : 0.2));
      } else if ('sec gcs mcs lcs ugs mae ume'.includes(g)) arm.push(fan(b, 0.50, g === 'sec' ? 0.4 : 0));
      else root.push(fan(b, -0.38, 0));
    }
    return { s, shoulder: J(`shoulder_${sfx}`), elbow: J(`elbow_${sfx}`), wrist: J(`wrist_${sfx}`), hand, arm, root };
  });
  tailRoots = [];
  for (const b of bones){
    const m = /^tail(\d+)_0_[LR]$/.exec(b.name);
    if (!m) continue;
    const along: THREE.Bone[] = [];
    b.traverse(c => { if (c !== b && (c as THREE.Bone).isBone) along.push(c as THREE.Bone); });
    b.getWorldPosition(V); along[0].getWorldPosition(V2).sub(V);
    const seg = along[0].position.length();
    tailRoots.push({ j: joint(b), i: Number(m[1]), yaw: Math.atan2(V2.x, -V2.z), along, seg, full: seg*along.length });
  }
  const group = (re: RegExp) => bones.filter(b => re.test(b.name));
  priRoots = group(/^pri\d+_0_/); secRoots = group(/^(sec|ter)\d+_0_/); crestRoots = group(/^crest\d+_0/); maneRoots = group(/^mane[ab]\d+_0/); utcRoots = group(/^utc\d+_0/);
  knots = group(/^knot_/); tassels = group(/^tas0_0_/); flowerB = by.get('flower')!; cords = group(/^cord\d+_0_/); twins = group(/^twin0_0_/);
  const hung: THREE.Bone[] = [];
  const hang = (name: string, roots: THREE.Bone[], [, , damping, stiffness, rot, limit, curve, gravity]: Hang) => {
    roots.forEach(r => r.traverse(c => { if ((c as THREE.Bone).isBone) hung.push(c as THREE.Bone); }));
    return new KawaiiNode({ name, component: rig, roots: roots.map(r => r.name), settings: {
      physics: { damping, stiffness, worldDampingLocation: 1, worldDampingRotation: rot, radius: 0, limitAngle: limit }, curves: { stiffness: curve },
      gravity: new THREE.Vector3(0, -gravity, 0), stepping: 'variable', substepRate: 120, maxSubsteps: 3 } });
  };
  for (const h of HANGS){
    nodes.push(hang(h[0], bones.filter(b => h[1].test(b.name) && /_0(_[LR])?$/.test(b.name) && b.children.some(c => (c as THREE.Bone).isBone)), h));
    windK.push(h[8]);
  }
  for (let i = 0; tailRoots.some(f => f.i === i); i++){
    const n = hang(`tail${i}`, tailRoots.filter(f => f.i === i).map(f => f.j.b), TAIL_HANG);
    nodes.push(n); windK.push(TAIL_HANG[8]); tailNodes.push(n);
  }
  snapshot = new PoseSnapshot(hung);
});

/* ---------- how she flies, by the climate ---------- */
// wing beats (rad/s), how far they go, how high she holds the wings, how far they stay folded, nose up, how much of the time she only
// soars, how the tail opens, how the neck stands. CALM is the sunlit sky, when the moods have gone
type Air = [number, number, number, number, number, number, number, number];
const CALM: Air = [5.6, 0.50, 0.15, 0, 0.42, 0.45, 1.1, 0.95];
const AIR: Record<'sprout' | 'warm' | 'clear' | 'storm' | 'cold' | 'thaw', Air> = {
  sprout: [6.6, 0.56, 0.12, 0.05, 0.34, 0.10, 0.8, 0.85],
  warm: [5.0, 0.46, 0.22, 0, 0.46, 0.70, 1.25, 1.05],
  clear: [5.2, 0.46, 0.16, 0, 0.42, 0.55, 1.1, 1.0],
  storm: [9.0, 0.66, 0.04, 0.12, 0.20, 0, 0.7, 0.45],
  cold: [4.2, 0.36, 0.0, 0.30, 0.22, 0.15, 0.55, 0.60],
  thaw: [5.4, 0.46, 0.12, 0.08, 0.34, 0.30, 0.9, 0.85],
};
const air = [...CALM] as Air;
let ph = 0, glideNow = 0;
const front = { at: 0, on: 0 };
let m1Now = 1, watch = 0, yawNow = 0, pitchNow = 0, restNow = 0;
// she blinks now and then: two rhythms that drift, so it is never quite regular. 1 open, 0 shut
const lidOf = (t: number, every: number, at: number) => { const k = (t + at)%every; return 1 - smooth(k, 0, 0.07)*(1 - smooth(k, 0.10, 0.22)); };
const P0 = new THREE.Vector3(), Dir = new THREE.Vector3(), Gq = new THREE.Quaternion();
const scaleAll = (bs: THREE.Bone[], k: number) => { if (k !== 1) for (const b of bs) b.scale.setScalar(k); };
// how wide a tail feather's card is at this length, in her own units: narrow while it is short, and never quite in proportion to its length
const tailWidth = (L: number) => 0.12 + 0.08*L;
/** How old she is on this day (src/age.ts): her bones scaled, her fire. @param day the day she has flown to @param n how many are flying now */
function growUp(day: number, n: number){
  const a = grownAt(day), [m1, m2] = moultAt(day);
  for (const w of wings) w.shoulder.b.scale.setScalar(0.74 + 0.26*a);
  // young: a big head and a short beak on a short neck, short round wings
  // (and waiting at today, when the lens stands far off and looks at her face, a little bigger still)
  headB.b.scale.setScalar((1.2 - 0.2*a)*(1 + 0.15*restNow)); beakB.b.scale.setScalar(0.55 + 0.45*a);
  neck2.b.position.copy(neck2P).multiplyScalar(0.6 + 0.4*a); headB.b.position.copy(headP).multiplyScalar(0.6 + 0.4*a);
  scaleAll(priRoots, 0.72 + 0.28*a); scaleAll(secRoots, 0.82 + 0.18*a);
  scaleAll(crestRoots, 0.16 + 0.34*a + 0.26*m1 + 0.24*m2); scaleAll(maneRoots, 0.10 + 0.45*a + 0.25*m1 + 0.20*m2); scaleAll(utcRoots, 0.45 + 0.35*a + 0.2*m1);
  // the tail: each pair by its own nights. A root's scale sets its width; its joints are spaced so the whole comes to the length. The last piece of the feather goes with the
  // last joint that bends, one segment long whatever the spacing, so it stays narrow enough until it is longer than that
  tailNodes.forEach((node, i) => { node.s.enabled = pairLength(i, day) > 0.02; });
  for (const f of tailRoots){
    const L = pairLength(f.i, day)*f.full/5, w = Math.max(0.001, Math.min(tailWidth(L)/tailWidth(5), L/(1.05*f.seg))), spacing = Math.max(0, (L/w - f.seg)/(f.full - f.seg));
    f.j.b.scale.setScalar(w);
    for (const b of f.along) b.position.multiplyScalar(spacing);
  }
  // what she wears, as she did: the red knots of 2021, the pale gold ones of 2022, from 2023 the red flower with its cords. And her hair those years, long, then a bob
  const u = mat.uniforms;
  for (const b of knots) b.scale.setScalar(Math.max(0.001, 1 - m2));
  scaleAll(tassels, Math.max(0.001, (1 - m1)*(1 - m2)));
  flowerB.scale.setScalar(Math.max(0.001, m2)); scaleAll(cords, Math.max(0.001, m2));
  scaleAll(twins, (0.35 + 0.65*a)*(1 - 0.55*m2));
  (u.uKnot.value as THREE.Vector3).lerpVectors(ORN_COLORS[0], KNOT_2022, m1);
  u.uM1.value = m1;
  (u.uHairA.value as THREE.Vector3).lerpVectors(HAIR[0][0], HAIR[1][0], m1).lerp(HAIR[2][0], m2);
  (u.uHairB.value as THREE.Vector3).lerpVectors(HAIR[0][1], HAIR[1][1], m1).lerp(HAIR[2][1], m2);
  const ember = emberAt(day, n), flare = flareAt(day);
  U.uEmber.value = ember; u.uYouth.value = 1 - a; u.uFlare.value = flare;
  m1Now = m1;
  moultFront(day, front);
  u.uFront.value.set(front.at, reduceMotion ? 0 : front.on);
  flight.glow = 1 - 0.5*ember + 0.6*flare;
}
/** @param glide 0 … 1 through a big night's gate: wings held out, no beat. @param rest 0 … 1 waiting at today: hanging on the wind, a few deep beats and then riding it with the wings up. */
export function poseBird(glide: number, rest: number, t: number, dt: number, day: number, n: number){
  glideNow += (glide - glideNow)*(1 - Math.exp(-dt*5));
  for (let i = 0; i < air.length; i++){ let v = CALM[i]; for (const k of ['sprout', 'warm', 'clear', 'storm', 'cold', 'thaw'] as const) v += W[k]*(AIR[k][i] - CALM[i]); air[i] = v; }
  const [freq, amp0, lift, tuck, pitch, soar, fan, stand] = air, still = glideNow;
  // waiting at today she has no way on and the wind holds her up: a few deep beats, then the wings held up in a shallow V, riding it, and so on, never quite regular
  const beats = smooth(Math.sin(t*0.43) + 0.55*Math.sin(t*1.07 + 1.3), -0.6, 0.45);
  // the stroke: the wings go down more slowly than they come up
  ph += dt*lerp(freq, lerp(1.9, 2.9, beats), rest)*(1 - 0.20*Math.sin(ph));
  // soaring comes and goes: a few beats, then the wings held
  const soaring = soar*smooth(Math.sin(t*0.6) + 0.5*Math.sin(t*1.43), -0.1, 0.6)*(1 - rest), amp = lerp(amp0*(1 - soaring)*(1 - 0.9*glideNow), lerp(0.10, 0.60, beats), rest);
  const sn = Math.sin(ph), k = Math.min(1, amp/0.3), elev = lift + 0.16*still + rest*(0.12 + 0.10*(1 - beats)) + amp*(Math.cos(ph) + 0.12*Math.cos(2*ph));
  // a big bird hardly folds on the way up: the arm first, the hand after it, as a whip goes. With no way on it has to fold further, or it would only push itself down again
  const up1 = Math.pow(Math.max(0, -Math.sin(ph - 0.15)), 1.3), up2 = Math.pow(Math.max(0, -Math.sin(ph - 0.55)), 1.3);
  const f1 = Math.min(1, tuck + lerp(0.46, 0.60, rest)*up1*k)*(1 - still), f2 = Math.min(1, tuck + lerp(0.58, 0.74, rest)*up2*k)*(1 - still);
  snapshot.restore();
  restNow = rest;
  growUp(day, n);
  // the body rises as the wings go down, and pitches with the stroke; the head is held still against that
  const bob = -0.085*amp*Math.cos(ph), nod = 0.13*amp*sn;
  body.b.position.y = bob;
  turn(body, nod, 0, 0);
  for (const w of wings){
    const s = w.s;
    // down: swept forward, the leading edge turned down. Up: swept back, and the hand trails below the arm
    turn(w.shoulder, 0.24*k*sn, s*(0.50*f1 - 0.17*k*sn - 0.10*rest), s*elev);
    turn(w.elbow, 0.10*k*Math.sin(ph - 0.2), -s*1.05*f1, s*0.30*amp*Math.sin(ph - 0.1));
    turn(w.wrist, 0.20*k*Math.sin(ph - 0.35), s*1.25*f2, s*(0.85*amp*Math.sin(ph - 0.3) - 0.25*f2));
    // on the way up the primaries turn edge on and let the air through, so the slots between them open
    const slot = 0.40*k*up2 + 0.05*Math.max(still, rest*(1 - beats))*Math.sin(t*0.9);
    for (const f of w.hand) fanTo(f, s*f.fold*f2, -s*f.twist*slot);
    for (const f of w.arm) fanTo(f, s*f.fold*f1, -s*f.twist*slot*0.5);
    for (const f of w.root) fanTo(f, s*f.fold*f1, 0);
  }
  // the tail: its fan opens as the climate has it, and pumps with the stroke
  const openTail = lerp(fan, 1.25, Math.max(still, rest));
  turn(tailB, 0.14*amp*Math.sin(ph - 1.0), 0.03*Math.sin(ph*0.5)*(1 - still) + 0.09*rest*Math.sin(t*0.61), 0);
  for (const f of tailRoots) turn(f.j, 0, -f.yaw*(openTail/1.1 - 1), 0);
  // the neck rises from the shoulders and the head comes level; she looks about, unless she has her head down in the storm
  const upright = lerp(stand, 1.05, Math.max(rest, 0.6*glideNow)), level = lerp(0.20, 0.90, rest);
  turn(neck1, 0.85*(1 - upright) - 0.5*nod, 0, 0);
  turn(neck2, 0.55*(upright - 1) + 0.5*level - 0.3*nod, 0.10*Math.sin(t*0.37)*(1 - W.storm) + 0.30*yawNow*watch, 0);
  // waiting at today she has turned to look at you, from the first frame: with the neck as well, a little to one side of square on.
  // The turn is taken in the neck's frame, where the head's own turn is measured
  headB.b.getWorldPosition(P0); Dir.copy(camera.position).sub(P0);
  neck2.b.getWorldQuaternion(Gq).multiply(neck2.Ri).invert(); Dir.applyQuaternion(Gq);
  const yawTo = Math.atan2(Dir.x, Dir.z), pitchTo = Math.atan2(-Dir.y, Math.hypot(Dir.x, Dir.z));
  const e = 1 - Math.exp(-dt*3);
  watch += ((STRAIGHT ? 0 : rest*smooth(Math.abs(yawTo), 2.7, 1.8)) - watch)*e;
  yawNow += (THREE.MathUtils.clamp(yawTo - 0.18*THREE.MathUtils.clamp(yawTo/0.3, -1, 1), -1.1, 1.1) - yawNow)*e; pitchNow += (THREE.MathUtils.clamp(pitchTo, -0.7, 0.85) - pitchNow)*e;
  turn(headB, lerp(0.30*(upright - 1) + 0.5*level - 0.2*nod, pitchNow, watch), lerp(0.28*Math.sin(t*0.37 + 0.3)*(1 - W.storm), yawNow, watch), 0.05*Math.sin(t*0.53)*(1 - watch));
  // her eyes follow the viewer anyway. Her first year's portrait has them shut in a smile, and so she flies; later she smiles at you now and then, if you have come close
  headB.b.getWorldQuaternion(Gq).multiply(headB.Ri).invert();
  Dir.copy(camera.position).sub(P0).applyQuaternion(Gq);
  const smile = Math.max(1 - m1Now, watch*smooth(Math.sin(t*0.37 + 1), 0.86, 0.97));
  mat.uniforms.uEye.value.set(Math.min(lidOf(t, 4.3, 0), lidOf(t, 6.7, 1.3))*(1 - smile), smile, Math.atan2(Dir.x, Dir.z), Math.atan2(Dir.y, Math.hypot(Dir.x, Dir.z)));
  rig.position.copy(bird.position); rig.quaternion.copy(bird.quaternion); rig.scale.copy(bird.scale);
  rig.updateWorldMatrix(false, true);
  if (PHYSICS){
    // the air on what hangs: blowing past her as fast as she goes (she does not hang in the air, and the bones are not told how fast the world goes by), across her as it gusts
    // (waiting at today the wind comes level, from ahead: it is what she hangs on, and her tail streams back on it and falls away in a long curve)
    V.set(0, 0, -1).applyQuaternion(bird.quaternion); V.y *= 1 - rest; V.normalize().multiplyScalar(1 - 0.3*rest);
    V2.set(Math.sin(t*0.71) + 0.5*Math.sin(t*1.9 + 1), 0.4*Math.sin(t*1.3), 0.3*Math.sin(t*0.53));
    const wind = 7 + 15*U.uWind.value;
    V.multiplyScalar(0.8).add(V2);
    for (let i = 0; i < nodes.length; i++){ const n = nodes[i]; n.s.wind.strength = wind*windK[i]*(1 + 1.2*rest); n.s.wind.direction.copy(V); n.s.wind.gust = 0.8; n.update(dt, true); }
  }
  const shake = reduceMotion ? 0 : W.storm;
  flight.pitch = pitch; flight.buffet = shake*(0.22*Math.sin(t*2.1) + 0.12*Math.sin(t*5.3 + 1.2));
  // (waiting at today the flock is the rest of her wings, and beats with them: src/flock.ts)
  flight.ph = ph; flight.amp = reduceMotion ? 0 : amp;
  // (each beat lifts her, a little after the wings have gone down; between them she settles)
  flight.heave = shake*(0.4*Math.sin(t*1.7 + 0.5) + 0.16*Math.sin(t*4.1)) - rest*1.1*amp*Math.cos(ph - 0.55);
  if (reduceMotion) hover.x = hover.y = hover.z = hover.lean = hover.yaw = 0;
  else {
    const d = rest*(STRAIGHT ? 0.4 : 1);
    hover.x = d*(1.6*Math.sin(t*0.23) + 0.7*Math.sin(t*0.53 + 1.1)); hover.y = d*0.9*Math.sin(t*0.31 + 2); hover.z = d*1.2*Math.sin(t*0.19 + 0.5);
    hover.lean = d*0.45*(1.6*0.23*Math.cos(t*0.23) + 0.7*0.53*Math.cos(t*0.53 + 1.1)); hover.yaw = d*0.07*Math.sin(t*0.37 + 1);
  }
}
const F1 = new THREE.Quaternion(), F2 = new THREE.Quaternion();
function fanTo(f: Fan, fold: number, twist: number){
  F1.setFromAxisAngle(f.up, fold); F2.setFromAxisAngle(f.along, twist);
  f.j.b.quaternion.copy(f.j.q0).multiply(F1).multiply(F2);
}
