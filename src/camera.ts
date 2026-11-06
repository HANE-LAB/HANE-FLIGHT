import * as THREE from 'three';
import { camera, reduceMotion, renderer } from './renderer';
import { S_END, bendAt, climbAt, pathDX, pathX, pathY, sAt } from './path';
import { U } from './uniforms';
import { clamp, smooth } from './dom';
import { GUARDS, JUMP, NDAYS } from './data';
import { reachOf } from './flock';
import { LAST_H, iA, iB, readHold } from './gates';
import { SHAPE } from './toriimodel';
import { restAt, seq } from './sequencer';
import { grownAt } from './age';

/* =====================================================================
   CAMERA — three views, each a function of how far she has flown, so a given moment always gives one picture:
     0 跟随  right behind her and a little over her, through every gate with her: she is the subject, the gates come up in
             front of her and go past the lens. It stands back only a little as the flock grows. Once it rises high behind her,
             on the night the count jumps. At today it swings round to her front and stands back to take in all of them. In the film
             it comes down behind the last gate instead, framing the sun, while she flies on
     1 仰望  low beside the line, looking up past her through the gates at the sky
     2 远望  far out on a long lens, the line of gates going away over the cloud
   Whatever the view, the lens is the viewer's too, as in Voyage: dragging turns it round her, the wheel or two fingers bring it in
   and out; closing in it comes round to look at her, and can go as near as her feathers.
   ===================================================================== */
const VIEWS = [{ name: '跟随', fov: 52 }, { name: '仰望', fov: 46 }, { name: '远望', fov: 22 }];
const qs = new URLSearchParams(location.search);
export const view = { n: clamp(Number(qs.get('view') || 0), 0, 2), yaw: Number(qs.get('yaw') || 0), pitch: Number(qs.get('pitch') || 0), zoom: Number(qs.get('zoom') || 1) };
/** Back to the view as composed. */
export function resetLens(){ view.yaw = view.pitch = 0; view.zoom = 1; }
const ZOOM_IN = 0.1, ZOOM_OUT = 2.6;
// (what the lens is at now: it eases to what the viewer asked for)
const lens = { yaw: view.yaw, pitch: view.pitch, zoom: view.zoom };
let blend = 1, pinch0 = 0, zoom0 = 1;
const el = renderer.domElement, ptrs = new Map<number, { x: number; y: number }>();
const pinchNow = () => { const [a, b] = [...ptrs.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
el.addEventListener('pointerdown', e => {
  el.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 2){ pinch0 = pinchNow(); zoom0 = view.zoom; }
});
el.addEventListener('pointermove', e => {
  const p = ptrs.get(e.pointerId);
  if (!p) return;
  if (ptrs.size === 1){
    if (reader.on){ reader.round = clamp(reader.round + (e.clientX - p.x)*0.004*reader.face*reader.post, -1.1, 1.1); const h = iB[reader.i*4]; reader.y = clamp(reader.y + (e.clientY - p.y)*0.0002*reader.fov*20/h, 0.16, 0.8); }
    else { view.yaw -= (e.clientX - p.x)*0.005; view.pitch = clamp(view.pitch + (e.clientY - p.y)*0.004, -1.0, 1.3); }
  }
  p.x = e.clientX; p.y = e.clientY;
  if (ptrs.size === 2 && pinch0 > 0){ if (reader.on) reader.fov = clamp(fov0*pinch0/pinchNow(), READ_FOV_NEAR, READ_FOV_FAR); else view.zoom = clamp(zoom0*pinch0/pinchNow(), ZOOM_IN, ZOOM_OUT); }
});
const endPtr = (e: PointerEvent) => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch0 = 0; };
el.addEventListener('pointerup', endPtr); el.addEventListener('pointercancel', endPtr);
el.addEventListener('wheel', e => { e.preventDefault(); if (reader.on) reader.fov = clamp(reader.fov*Math.exp(e.deltaY*0.0012), READ_FOV_NEAR, READ_FOV_FAR); else view.zoom = clamp(view.zoom*Math.exp(e.deltaY*0.0012), ZOOM_IN, ZOOM_OUT); }, { passive: false });

/* ---------- stopped, the viewer can go and read a post: a long lens from where a gate's own fade will not touch it. Dragging goes round it and up and down, the
   wheel or two fingers bring it nearer. It only takes over from the view in hand, and gives it back the same ---------- */
const READ_DIST = 18, READ_FOV_NEAR = 6, READ_FOV_FAR = 30;
export const reader = { on: false, i: 0, post: 1 as 1 | -1, face: -1 as 1 | -1, y: 0.5, round: 0, fov: 15, k: 0, faceK: -1 };
export function readGate(i: number){ reader.on = true; reader.i = i; reader.face = -1; reader.y = 0.5; reader.round = 0; reader.fov = 15; reader.post = 1; reader.faceK = -1; }
export const setReadFace = (f: 1 | -1) => { reader.face = f; };
export const stopReading = () => { reader.on = false; };
let fov0 = 15;
el.addEventListener('pointerdown', () => { if (ptrs.size === 2) fov0 = reader.fov; });
const Lp = new THREE.Vector3(), Ll = new THREE.Vector3();
export function setView(n: number){ if (n !== view.n){ view.n = n; blend = 0; } }

// how far back the count asks the camera to stand: smoothed over days, or it would jerk with every change in the count
const BACK = new Float32Array(NDAYS);
for (let d = 0; d < NDAYS; d++){
  let sum = 0, n = 0;
  for (let k = Math.max(0, d - 8); k <= Math.min(NDAYS - 1, d + 8); k++){ sum += reachOf(GUARDS[k]); n++; }
  BACK[d] = sum/n;
}
const backAt = (u: number) => { const a = Math.max(0, Math.min(NDAYS - 1, u)), k = Math.min(NDAYS - 2, Math.floor(a)); return BACK[k] + (BACK[k + 1] - BACK[k])*(a - k); };

const Cr = new THREE.Vector3(), Tr = new THREE.Vector3(), C = new THREE.Vector3(), T = new THREE.Vector3(), her = new THREE.Vector3(), q = new THREE.Quaternion(), from = new THREE.Vector3(), to = new THREE.Vector3(), Cf = new THREE.Vector3(), Tf = new THREE.Vector3();
const lineAt = (s: number, y: number, out: THREE.Vector3) => out.set(pathX(s), pathY(s) + climbAt(s) + y, s);
/** 0 … 1: how far the lens has risen behind her, around the night the count jumps. */
export const craneAt = (u: number) => smooth(u, JUMP - 0.5, JUMP + 2.5)*(1 - smooth(u, JUMP + 5, JUMP + 8.5));
// where the lens stands at today: how far round from behind her (radians), how far off, how high; and where it looks, along the line behind her
// (?straight, for recording: all the way round to dead ahead of her and lower, the gates in line behind her and her wings level with each other, the flock's the same to either side)
const STRAIGHT = qs.has('straight');
const AZ = STRAIGHT ? Math.PI : 2.5, DIST = 110, HIGH = STRAIGHT ? 30 : 38, LOOK_Z = -60, LOOK_Y = STRAIGHT ? 15 : 8;
const BIRD_Y = 7.2, DEG = Math.PI/180;
let lean = 1;
function want(u: number){
  const s = sAt(u), reach = backAt(u);
  if (view.n === 0){
    // right behind her, through the gates with her, a little over her and looking along past her. It only stands back a little
    // for the flock, which flies round her and round the lens. Once only, on the night the count jumps, it rises high behind
    // her as the sky opens, to take in the sun and the thousands coming up; then it comes down to her again
    const crane = craneAt(u);
    // (while she is small the lens is nearer, so she is no smaller in the picture, only smaller than the gates)
    const near = 0.72 + 0.28*grownAt(u);
    const r = Math.min(reach, 60), back = (11 + 0.16*r)*near + 120*crane;
    // (a slow drift to either side of the lanterns that hang in the middle of each gate; up there, off to the moon's side, so
    // the gates she is flying through do not stand in front of her)
    const side = (1.9 + 0.03*r)*Math.sin(s/330 + 0.6)*(1 - crane) - 54*crane, up = BIRD_Y + (1.7 + 0.5*Math.sin(s/210) + 0.025*r)*near + 64*crane;
    const sc = s - back, dx = pathDX(sc), sn = Math.hypot(1, dx);
    lineAt(sc, up, C); C.x += side/sn; C.z += -side*dx/sn;
    // she sits a little under the middle of the frame, whatever the height of the lens
    const look = 55, dist = back + look;
    const pitch = Math.atan((BIRD_Y - up)/back) + (5.5 + 8*crane)*DEG;
    lineAt(s + look, 0, T); T.y = C.y + Math.tan(pitch)*dist;
    // the end: only once she is through the last gate and the gates behind her have gone back into the cloud, it comes
    // down behind that gate at half its height, looking along the line, the sun in the gate; she flies on
    const fin = seq.film ? smooth(s, S_END - 150, S_END + 310) : 0;
    if (fin > 0){
      // (far enough back that the gate fits, near enough that the low sun, 3.5° up, stands under its tie beam)
      // (on the straight back from the gate along the way the sun lies, which the curving line is not, this far off)
      const eye = 8, stand = (SHAPE.nukiY*LAST_H - eye)/0.076, gx = pathX(S_END), gd = pathDX(S_END);
      Cf.set(gx - gd*stand, pathY(S_END - stand) + eye, S_END - stand); Tf.set(gx + gd*900, eye + (stand + 900)*Math.tan(4.8*DEG), S_END + 900);
      C.lerp(Cf, fin); T.lerp(Tf, fin);
    }
    // waiting at today, as Voyage's page opens: the lens out ahead of her and above, looking back, she at the head of them all and
    // the gates she has come through going away behind her
    // It swings round her by the side, out of the line of the gates, with her in the middle of the frame all the way
    const rest = restAt(u);
    if (rest > 0){
      // (a tall screen is narrow: it stands further back to get both wings in)
      const tall = camera.aspect < 1 ? 1.35 : 1;
      const a = AZ*rest, d = back + (DIST*tall - back)*Math.sin(rest*Math.PI/2), h = up + (HIGH*tall - up)*rest + 16*Math.sin(rest*Math.PI);
      // (straight: square to the line as it runs where she is, which is not quite the way of the world's axes)
      const lineYaw = STRAIGHT ? Math.atan(pathDX(s)) : 0;
      Cr.set(pathX(s) + d*Math.sin(a - lineYaw), pathY(s) + h, s - d*Math.cos(a - lineYaw));
      // (on a tall screen the sky can have the top of the frame)
      if (STRAIGHT) Tr.set(pathX(s) + LOOK_Z*rest*Math.tan(lineYaw), LOOK_Y, s + LOOK_Z*rest);
      else Tr.set(pathX(s + LOOK_Z*rest), LOOK_Y + (camera.aspect < 1 ? 26 : 0), s + LOOK_Z*rest);
      const k = smooth(rest, 0, 0.2);
      C.lerp(Cr, k); T.lerp(Tr, k);
    }
    lean = (1 - fin)*(1 - rest);
    return VIEWS[0].fov;
  }
  if (view.n === 1){
    const sc = Math.min(s - 46, S_END - 40);
    lineAt(sc, 6, C); C.x += 30;
    lineAt(Math.min(s + 60, S_END + 200), 34, T);
    return VIEWS[1].fov;
  }
  // far out on the moon's side of the line and high enough to look down over the towers into the valley
  lineAt(s - 620, 400 + reach*0.4, C); C.x += 360;
  lineAt(s + 120, 8, T);
  return VIEWS[2].fov;
}
/** @param u her day */
export function updateCamera(u: number, dt: number){
  const f = want(u);
  const e = 1 - Math.exp(-dt*9);
  lens.yaw += (view.yaw - lens.yaw)*e; lens.pitch += (view.pitch - lens.pitch)*e; lens.zoom += (view.zoom - lens.zoom)*e;
  if (Math.abs(lens.yaw) > 1e-4 || Math.abs(lens.pitch) > 1e-4 || Math.abs(lens.zoom - 1) > 1e-4){
    // the whole view turns round her, so she stays where she is in the picture; closing in, it comes round to look at her
    const H = U.uBird.value;
    her.set(H.x, H.y, H.z); from.copy(C).sub(her);
    const r = from.length(); from.divideScalar(r);
    const up = clamp(Math.asin(from.y) + lens.pitch, -0.35, 1.45), az = Math.atan2(from.x, from.z) + lens.yaw;
    to.set(Math.cos(up)*Math.sin(az), Math.sin(up), Math.cos(up)*Math.cos(az));
    q.setFromUnitVectors(from, to);
    T.sub(her).applyQuaternion(q).multiplyScalar(1 - smooth(1 - lens.zoom, 0, 0.5)).add(her);
    // (no nearer than her wings allow; she has grown, waiting at today)
    C.copy(her).addScaledVector(to, Math.max(r*lens.zoom, Math.min(r, 4 + 6*restAt(u))));
    C.y = Math.max(C.y, pathY(sAt(u)) + 1.5);
  }
  // reading a post: the long lens takes over from the view in hand (see reader)
  reader.k += ((reader.on ? 1 : 0) - reader.k)*(1 - Math.exp(-dt*(reduceMotion ? 30 : 3.0)));
  if (Math.abs(reader.k) < 1e-3) reader.k = 0;
  reader.faceK += (reader.face - reader.faceK)*(1 - Math.exp(-dt*3.4));
  const rk = reader.k*reader.k*(3 - 2*reader.k);
  readHold.i = rk > 0 ? reader.i : -1; readHold.k = smooth(rk, 0, 0.6);
  if (rk > 0){
    const i = reader.i, h = iB[i*4], yaw = iA[i*4 + 3], cy = Math.cos(yaw), sy = Math.sin(yaw), fx = reader.post*(0.31 - 0.0175*reader.y)*h, y = reader.y*h;
    // (round the post from the one face to the other, not through it)
    const turn = (1 + reader.faceK)*Math.PI/2 + reader.round, far = camera.aspect < 1 ? READ_DIST*1.2 : READ_DIST;
    const lx = fx + reader.post*Math.sin(turn)*far, lz = -Math.cos(turn)*far;
    Lp.set(iA[i*4] + cy*lx - sy*lz, iA[i*4 + 1] + y, iA[i*4 + 2] + sy*lx + cy*lz);
    Ll.set(iA[i*4] + cy*fx, iA[i*4 + 1] + y, iA[i*4 + 2] + sy*fx);
    C.lerp(Lp, rk); T.lerp(Ll, rk);
  }
  const fw = rk > 0 ? f + (reader.fov - f)*rk : f;
  // a view change glides; on the same view the camera is exactly where the formula says
  blend = Math.min(1, blend + dt*0.6);
  if (blend < 1) camera.position.lerp(C, blend*blend*(3 - 2*blend)); else camera.position.copy(C);
  camera.lookAt(T);
  // she banks into the curves; the camera leans with her a little
  if (!reduceMotion && view.n === 0) camera.rotateZ(clamp(-bendAt(u)*110, -0.10, 0.10)*lean*(1 - rk));
  // the lens keeps its width on a tall screen: a phone held upright sees as wide as about 6:5 would at its height
  const aspect = camera.aspect, vf = aspect >= 1.2 || rk >= 1 ? fw : fw + (2*Math.atan(Math.tan(f*Math.PI/360)*1.2/aspect)*180/Math.PI - f)*(1 - rk);
  if (Math.abs(camera.fov - vf) > 0.01){ camera.fov = vf; camera.updateProjectionMatrix(); }
  U.uPx.value = innerHeight/2/Math.tan(camera.fov*Math.PI/360);
}
