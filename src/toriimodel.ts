import * as THREE from 'three';

// smooth normals for ink outlines and cel shading (faces that share a corner push out together)
function addOutlineNormals(g: THREE.BufferGeometry){
  const pos = g.getAttribute('position'), nor = g.getAttribute('normal'), n = pos.count;
  const map = new Map<string, number>(), acc: number[] = [], idx = new Int32Array(n);
  for (let i = 0; i < n; i++){
    const k = Math.round(pos.getX(i)*1e4) + ',' + Math.round(pos.getY(i)*1e4) + ',' + Math.round(pos.getZ(i)*1e4);
    let j = map.get(k); if (j === undefined){ j = acc.length/3; map.set(k, j); acc.push(0, 0, 0); }
    idx[i] = j; acc[j*3] += nor.getX(i); acc[j*3+1] += nor.getY(i); acc[j*3+2] += nor.getZ(i);
  }
  const out = new Float32Array(n*3);
  for (let i = 0; i < n; i++){ const j = idx[i], x = acc[j*3], y = acc[j*3+1], z = acc[j*3+2], l = Math.hypot(x, y, z) || 1; out[i*3] = x/l; out[i*3+1] = y/l; out[i*3+2] = z/l; }
  g.setAttribute('aOutN', new THREE.BufferAttribute(out, 3));
}
/* =====================================================================
   TORII MODELS — the gates in three grades, in shape units (the cap's top at about 1.0; a gate is scaled up by its height):
     素木  a 神明鳥居: round posts running up into a round log, a tie beam through them, a bare board on a short strut. Plain, but whole
     朱門  Fushimi Inari's 稲荷鳥居: leaning posts with black feet and collars, 台輪, curved 島木 and 笠木 cut at a slant, a tie beam
           wedged through the posts, a strut with a framed plaque
     火羽  the same gate dressed for the big nights: gilt sleeves and studs on the beam ends, gilt bands on the posts, a rope
           (注連縄) with paper (紙垂) under the tie beam, and in the middle of the top beam a gilt mount with two sockets. The fire
           feathers that stand in them are drawn in src/gates.ts
   Every part is closed: a lathe or a prism with both its ends capped. Each comes with smooth normals where it is round and flat
   ones where it is cut, and its part number, which torii.frag.glsl shades by.
   ===================================================================== */
type V3 = [number, number, number];
/** aPart: what torii.frag.glsl shades it as. 9, 11, 12 only show on the 火羽 grade (torii.vert.glsl). */
const PART = { POST: 0, FOOT: 1, RING: 2, TIE: 3, WEDGE: 4, STRUT: 5, SHIMA: 6, KASA: 7, CAP: 8, GOLD: 9, PLAQUE: 10, ROPE: 11, PAPER: 12, WOOD: 13, WOOD_END: 14, WOOD_BOARD: 15, SNOW: 16 };
const RED: V3 = [0.80, 0.17, 0.09], BLACK: V3 = [0.045, 0.040, 0.042], GOLD: V3 = [0.86, 0.60, 0.20], ROPE: V3 = [0.66, 0.54, 0.30], PAPER: V3 = [0.92, 0.91, 0.87], BOARD: V3 = [0.035, 0.032, 0.05], WOOD: V3 = [0.56, 0.45, 0.27], PALE_WOOD: V3 = [0.74, 0.62, 0.42];
const kasaRise = (x: number) => 0.040*Math.pow(Math.min(1, Math.abs(x)/SHAPE.kasaX), 2.2);   // 反り: the ends lift
/** Shape units: the top of the cap is at about 1.0; posts 0.62 apart at the foot. */
export const SHAPE = { postX: 0.31, postTopX: 0.296, postTop: 0.80, nukiY: 0.655, shimaY0: 0.83, kasaY0: 0.872, kasaX: 0.58 };

/** The pair of fire feathers on the 火羽 grade, in the middle of the top beam: how long, how far they lean, and where the quills
 *  start, inside their gilt sockets (src/gates.ts lays the feathers from this). */
const BEAM_TOP = SHAPE.kasaY0 + 0.066;
export const FEATHER = { len: 0.48, tilt: 0.40, x: 0.030, y: BEAM_TOP - 0.016 };   // (the bare quill is all inside the socket: the vane comes straight out of it)

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1]*b[2] - a[2]*b[1], a[2]*b[0] - a[0]*b[2], a[0]*b[1] - a[1]*b[0]];
const dot = (a: V3, b: V3) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
const norm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0]/l, a[1]/l, a[2]/l]; };

class Model {
  P: number[] = []; N: number[] = []; C: number[] = []; A: number[] = [];
  /** A triangle, wound to face the way its normals say. */
  tri(a: V3, b: V3, c: V3, na: V3, nb: V3, nc: V3, col: V3, part: number){
    const out = dot(cross(sub(b, a), sub(c, a)), [na[0] + nb[0] + nc[0], na[1] + nb[1] + nc[1], na[2] + nb[2] + nc[2]]) >= 0;
    const [p, q, np, nq] = out ? [b, c, nb, nc] : [c, b, nc, nb];
    this.P.push(...a, ...p, ...q); this.N.push(...na, ...np, ...nq);
    for (let i = 0; i < 3; i++){ this.C.push(...col); this.A.push(part); }
  }
  quad(a: V3, b: V3, c: V3, d: V3, na: V3, nb: V3, nc: V3, nd: V3, col: V3, part: number){ this.tri(a, b, c, na, nb, nc, col, part); this.tri(a, c, d, na, nc, nd, col, part); }
  /** A round thing along an upright axis that may lean (its centre at x0 + (y - y0)*lean): rings at the profile's [y, radius], capped at both ends. */
  lathe(x0: number, y0: number, lean: number, z: number, prof: number[][], sides: number, col: V3, part: number){
    const at = (k: number, a: number): V3 => { const [y, r] = prof[k]; return [x0 + (y - y0)*lean + Math.cos(a)*r, y, z + Math.sin(a)*r]; };
    const nr = (k: number, a: number): V3 => {
      const i = Math.max(0, k - 1), j = Math.min(prof.length - 1, k + 1), dr = (prof[j][1] - prof[i][1])/Math.max(1e-5, prof[j][0] - prof[i][0]);
      return norm([Math.cos(a), -dr, Math.sin(a)]);
    };
    const da = 2*Math.PI/sides;
    for (let k = 0; k + 1 < prof.length; k++) for (let s = 0; s < sides; s++){
      const a = s*da, b = a + da;
      this.quad(at(k, a), at(k + 1, a), at(k + 1, b), at(k, b), nr(k, a), nr(k + 1, a), nr(k + 1, b), nr(k, b), col, part);
    }
    for (const [k, ny] of [[0, -1], [prof.length - 1, 1]]){
      const y = prof[k][0], c: V3 = [x0 + (y - y0)*lean, y, z], n: V3 = [0, ny, 0];
      for (let s = 0; s < sides; s++) this.tri(c, at(k, s*da), at(k, (s + 1)*da), n, n, n, col, part);
    }
  }
  /** A straight prism from p0 to p1: the section is [u, v] points going round (u along U, v along V), facets flat, ends capped. */
  prism(p0: V3, p1: V3, U: V3, V: V3, sec: number[][], col: V3, part: number | ((i: number) => number)){
    this.sweep([p0, p1], U, V, sec, col, part);
  }
  /** The same along a path of points. shift(i, v) moves a section's point along the path's first axis (a slanted cut). */
  sweep(path: V3[], U: V3, V: V3, sec: number[][], col: V3, part: number | ((i: number) => number), wide?: (k: number) => number, shift?: (k: number, u: number, v: number) => number, colOf?: (i: number) => V3){
    const n = sec.length, along = norm(sub(path[path.length - 1], path[0]));
    const pt = (k: number, i: number): V3 => {
      const c = path[k], w = wide ? wide(k) : 1, u = sec[i][0], v = sec[i][1]*w, sh = shift ? shift(k, u, v) : 0;
      return [c[0] + U[0]*u + V[0]*v + along[0]*sh, c[1] + U[1]*u + V[1]*v + along[1]*sh, c[2] + U[2]*u + V[2]*v + along[2]*sh];
    };
    for (let i = 0; i < n; i++){
      const j = (i + 1)%n, pr = typeof part === 'number' ? part : part(i), cl = colOf ? colOf(i) : col;
      const eu = sec[j][0] - sec[i][0], ev = sec[j][1] - sec[i][1];
      // the facet's normal, out from the section's middle (the path may rise, which tips it a little along the way)
      let mu = 0, mv = 0; for (const q of sec){ mu += q[0]/n; mv += q[1]/n; }
      let nu = ev, nv = -eu;
      if (nu*((sec[i][0] + sec[j][0])/2 - mu) + nv*((sec[i][1] + sec[j][1])/2 - mv) < 0){ nu = -nu; nv = -nv; }
      for (let k = 0; k + 1 < path.length; k++){
        const slope = sub(path[k + 1], path[k]), a = norm(slope);
        const f: V3 = norm([U[0]*nu + V[0]*nv, U[1]*nu + V[1]*nv, U[2]*nu + V[2]*nv]);
        const tip = -dot(f, a), nn = norm([f[0] + a[0]*tip, f[1] + a[1]*tip, f[2] + a[2]*tip]);
        this.quad(pt(k, i), pt(k + 1, i), pt(k + 1, j), pt(k, j), nn, nn, nn, nn, cl, pr);
      }
    }
    for (const [k, s] of [[0, -1], [path.length - 1, 1]] as const){
      let c: V3 = [0, 0, 0]; for (let i = 0; i < n; i++){ const q = pt(k, i); c = [c[0] + q[0]/n, c[1] + q[1]/n, c[2] + q[2]/n]; }
      const nn: V3 = [along[0]*s, along[1]*s, along[2]*s], pr = typeof part === 'number' ? part : part(0);
      for (let i = 0; i < n; i++) this.tri(c, pt(k, i), pt(k, (i + 1)%n), nn, nn, nn, colOf ? colOf(0) : col, pr);
    }
  }
  /** A tube along a path with a twist in its surface (a rope): r(t) at each point, closed at both ends. */
  tube(path: V3[], r: (t: number) => number, sides: number, twist: number, col: V3, part: number){
    const m = path.length;
    const tan = (k: number) => norm(sub(path[Math.min(m - 1, k + 1)], path[Math.max(0, k - 1)]));
    const ring = (k: number, s: number): [V3, V3] => {
      const t = k/(m - 1), T = tan(k), S = norm(cross(T, [0, 0, 1])), Q = cross(T, S), a = s*2*Math.PI/sides;
      const rr = r(t)*(1 + 0.16*Math.cos(2*a + t*twist));
      const d: V3 = [S[0]*Math.cos(a) + Q[0]*Math.sin(a), S[1]*Math.cos(a) + Q[1]*Math.sin(a), S[2]*Math.cos(a) + Q[2]*Math.sin(a)];
      return [[path[k][0] + d[0]*rr, path[k][1] + d[1]*rr, path[k][2] + d[2]*rr], d];
    };
    for (let k = 0; k + 1 < m; k++) for (let s = 0; s < sides; s++){
      const [a, na] = ring(k, s), [b, nb] = ring(k + 1, s), [c, nc] = ring(k + 1, s + 1), [d, nd] = ring(k, s + 1);
      this.quad(a, b, c, d, na, nb, nc, nd, col, part);
    }
    for (const [k, sg] of [[0, -1], [m - 1, 1]] as const){
      const T = tan(k), n: V3 = [T[0]*sg, T[1]*sg, T[2]*sg];
      for (let s = 0; s < sides; s++) this.tri(path[k], ring(k, s)[0], ring(k, s + 1)[0], n, n, n, col, part);
    }
  }
  geo(){
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3));
    g.setAttribute('aPart', new THREE.Float32BufferAttribute(this.A, 1));
    addOutlineNormals(g);
    return g;
  }
}
const X: V3 = [1, 0, 0], Y: V3 = [0, 1, 0], Z: V3 = [0, 0, 1];
/** A rectangle's section with its corners cut. */
const chamfer = (hu: number, hv: number, c: number) => [[-hu + c, -hv], [hu - c, -hv], [hu, -hv + c], [hu, hv - c], [hu - c, hv], [-hu + c, hv], [-hu, hv - c], [-hu, -hv + c]];

/** The snow lying along a beam: a lumpy, rounded cap, tapering to nothing at its ends. It waits inside the beam until the cold raises it
 *  (torii.vert.glsl reads how far from the red of its colour). */
function snowCap(m: Model, x0: number, y: (x: number) => number, dz: (x: number) => number, h0: number, seed: number){
  const N = 28, prof = [[-1.08, -0.15], [-0.94, 0.40], [-0.56, 0.86], [0, 1], [0.56, 0.86], [0.94, 0.40], [1.08, -0.15]], col: V3 = [h0, 0, 0];
  const at = (i: number, k: number): V3 => {
    const x = x0*(2*i/N - 1), lump = 0.74 + 0.18*Math.sin(x*41 + seed) + 0.10*Math.sin(x*97 + seed*2.3), end = Math.min(1, (x0 - Math.abs(x))/(x0*0.12));
    return [x, y(x) + prof[k][1]*h0*lump*end, prof[k][0]*dz(x)];
  };
  const nr = (k: number): V3 => norm([0, 1.0 + 0.2*prof[k][1], prof[k][0]*1.3]);
  for (let i = 0; i < N; i++) for (let k = 0; k + 1 < prof.length; k++) m.quad(at(i, k), at(i + 1, k), at(i + 1, k + 1), at(i, k + 1), nr(k), nr(k), nr(k + 1), nr(k + 1), col, PART.SNOW);
}

/** 朱門 and 火羽: the one mesh; the 火羽 parts are hidden on the 朱門 grade by the vertex shader. */
export function buildRedTorii(){
  const m = new Model();
  const lean = (SHAPE.postTopX - SHAPE.postX)/SHAPE.postTop;
  const SIDES = 20;
  for (const sx of [-1, 1]){
    const x0 = sx*SHAPE.postX, l = sx*lean;
    const xAt = (y: number) => x0 + y*l;
    // the post, a little waisted toward the top
    m.lathe(x0, 0, l, 0, [[0.178, 0.0412], [0.40, 0.0398], [0.62, 0.0384], [0.79, 0.0372]], SIDES, RED, PART.POST);
    // its black foot (根巻), running on under the cloud, with a collar at the top of it
    m.lathe(x0, 0, l, 0, [[-0.70, 0.047], [0.15, 0.0455], [0.158, 0.0472], [0.170, 0.0472], [0.178, 0.0425]], SIDES, BLACK, PART.FOOT);
    // 台輪: a moulded ring at the head of the post
    m.lathe(x0, 0, l, 0, [[0.790, 0.0372], [0.797, 0.0420], [0.801, 0.0470], [0.818, 0.0480], [0.824, 0.0450], [0.843, 0.0420]], SIDES, RED, PART.RING);
    // gilt bands (火羽 only)
    m.lathe(x0, 0, l, 0, [[0.752, 0.0378], [0.755, 0.0398], [0.775, 0.0392], [0.778, 0.0374]], SIDES, GOLD, PART.GOLD);
    m.lathe(x0, 0, l, 0, [[0.176, 0.0425], [0.179, 0.0446], [0.196, 0.0440], [0.199, 0.0415]], SIDES, GOLD, PART.GOLD);
    // the wedge driven through the tie beam just outside the post, a smaller one over it
    const wx = xAt(SHAPE.nukiY) + sx*0.060;
    m.prism([wx, SHAPE.nukiY - 0.046, 0], [wx, SHAPE.nukiY + 0.044, 0], X, Z, chamfer(0.0095, 0.024, 0.0025), RED, PART.WEDGE);
    m.prism([wx + sx*0.0025, SHAPE.nukiY + 0.044, 0], [wx + sx*0.0025, SHAPE.nukiY + 0.056, 0], X, Z, chamfer(0.0070, 0.018, 0.0018), RED, PART.WEDGE);
  }
  // 貫: through the posts and out past them, its ends cut a little under
  m.sweep([[-0.415, SHAPE.nukiY, 0], [0.415, SHAPE.nukiY, 0]], Y, Z, chamfer(0.026, 0.0185, 0.0035), RED, PART.TIE, undefined, (k, u) => (k ? 1 : -1)*u*0.20);
  // 額束: the strut between the tie beam and the second beam
  m.prism([0, SHAPE.nukiY + 0.020, 0], [0, SHAPE.shimaY0 + 0.004, 0], X, Z, chamfer(0.025, 0.016, 0.003), RED, PART.STRUT);
  // the plaque on it (神額), on both faces: a dark board in a gilt frame. The night's date is written on it (src/plaque.ts,
  // torii.frag.glsl lays it out: keep the board's middle and size the same there)
  for (const s of [-1, 1]){
    const z = s*0.0215, yc = 0.752, hw = 0.048;
    m.prism([0, yc - 0.052, z], [0, yc + 0.052, z], X, Z, chamfer(hw, 0.0052, 0.0015), BOARD, PART.PLAQUE);
    const fz = s*0.0245, fw = 0.0052, fx = hw + 0.004;
    m.prism([-fx, yc - 0.056, fz], [-fx, yc + 0.056, fz], X, Z, chamfer(fw, 0.0048, 0.0012), GOLD, PART.PLAQUE);
    m.prism([fx, yc - 0.056, fz], [fx, yc + 0.056, fz], X, Z, chamfer(fw, 0.0048, 0.0012), GOLD, PART.PLAQUE);
    m.prism([-fx - 0.005, yc + 0.056, fz], [fx + 0.005, yc + 0.056, fz], Y, Z, chamfer(fw, 0.0048, 0.0012), GOLD, PART.PLAQUE);
    m.prism([-fx - 0.005, yc - 0.056, fz], [fx + 0.005, yc - 0.056, fz], Y, Z, chamfer(fw, 0.0048, 0.0012), GOLD, PART.PLAQUE);
  }
  // the beams curve: rows of points along x, the slant of the cut at each end
  const row = (x0: number, n: number, lift: number, y0: number): V3[] => Array.from({ length: n + 1 }, (_, i) => { const x = -x0 + 2*x0*i/n; return [x, y0 + kasaRise(x)*lift, 0]; });
  // 島木: vermilion, on the same curve as the beam over it, so the two lie together
  const SX = 0.475;
  m.sweep(row(SX, 24, 1, SHAPE.shimaY0 + 0.021), Y, Z, chamfer(0.021, 0.033, 0.004), RED, PART.SHIMA, undefined, (k, u) => (k === 0 ? -1 : k === 24 ? 1 : 0)*(u + 0.021)*0.28);
  // 笠木: black lacquer, its top a little wider, as the weathering board over it, and crowned; cut at a slant, top reaching furthest
  const KX = SHAPE.kasaX, K = 28;
  const sec = [[0, -0.037], [0, 0.037], [0.030, 0.040], [0.032, 0.0462], [0.052, 0.0462], [0.0585, 0.031], [0.062, 0.0], [0.0585, -0.031], [0.052, -0.0462], [0.032, -0.0462], [0.030, -0.040]];
  const wide = (k: number) => 1 + 0.22*Math.abs(2*k/K - 1);
  m.sweep(row(KX, K, 1, SHAPE.kasaY0), Y, Z, sec, BLACK, i => i >= 3 && i <= 8 ? PART.CAP : PART.KASA, wide, (k, u) => (k === 0 ? -1 : k === K ? 1 : 0)*u*0.34);
  // gilt sleeves on the ends of both beams, with a row of studs (乳金物) (火羽 only)
  const STUD: V3[] = [];
  for (const s of [-1, 1]){
    const kasaEnd = (x: number): V3 => [s*x, SHAPE.kasaY0 + kasaRise(x), 0];
    const pts = [0.500, 0.525, 0.550, 0.585].map(kasaEnd);
    // (the sleeve follows the beam's own section, a little proud of it)
    const proud = [[-0.003, -0.041], [-0.003, 0.041], [0.030, 0.0445], [0.034, 0.0505], [0.056, 0.0505], [0.063, 0.034], [0.0665, 0.0], [0.063, -0.034], [0.056, -0.0505], [0.034, -0.0505], [0.030, -0.0445]];
    const pth = s > 0 ? pts : [...pts].reverse();
    m.sweep(pth, Y, Z, proud, GOLD, PART.GOLD, () => 1 + 0.20*0.88, (k, u) => (k === (s > 0 ? pts.length - 1 : 0) ? s : 0)*u*0.34);
    const shEnd = (x: number): V3 => [s*x, SHAPE.shimaY0 + 0.021 + kasaRise(x), 0];
    const p2 = [0.420, 0.450, 0.480].map(shEnd);
    m.sweep(s > 0 ? p2 : [...p2].reverse(), Y, Z, chamfer(0.0245, 0.0365, 0.004), GOLD, PART.GOLD, undefined, (k, u) => (k === (s > 0 ? 2 : 0) ? s : 0)*(u + 0.021)*0.28);
    for (const x of [0.513, 0.538, 0.562]) for (const z of [-1, 1]){ const c = kasaEnd(x); STUD.push([c[0], c[1] + 0.018, z*0.0555]); STUD.push([c[0], c[1] + 0.044, z*0.0585]); }
  }
  // the mount in the middle of the top beam: a gilt sleeve over it, and on that two sockets the feathers' quills go into
  {
    const pts: V3[] = [-0.085, -0.04, 0, 0.04, 0.085].map(x => [x, SHAPE.kasaY0 + kasaRise(x), 0]);
    const proud = [[-0.003, -0.041], [-0.003, 0.041], [0.030, 0.0445], [0.034, 0.0505], [0.056, 0.0505], [0.0635, 0.034], [0.067, 0.0], [0.0635, -0.034], [0.056, -0.0505], [0.034, -0.0505], [0.030, -0.0445]];
    m.sweep(pts, Y, Z, proud, GOLD, PART.GOLD);
    for (const x of [-0.066, -0.040, 0.040, 0.066]) for (const z of [-1, 1]){ STUD.push([x, SHAPE.kasaY0 + 0.016, z*0.0448]); STUD.push([x, SHAPE.kasaY0 + 0.045, z*0.0525]); }
    const l = Math.tan(FEATHER.tilt), t = BEAM_TOP;
    for (const s of [-1, 1]) m.lathe(s*FEATHER.x, FEATHER.y, s*l, 0, [[t - 0.012, 0.0120], [t + 0.002, 0.0190], [t + 0.008, 0.0165], [t + 0.014, 0.0110], [t + 0.034, 0.0110], [t + 0.038, 0.0140], [t + 0.048, 0.0140], [t + 0.051, 0.0085]], 12, GOLD, PART.GOLD);
  }
  for (const c of STUD) m.lathe(c[0], c[1], 0, c[2], [[c[1] - 0.0052, 0.0], [c[1] - 0.0040, 0.0034], [c[1], 0.0052], [c[1] + 0.0040, 0.0034], [c[1] + 0.0052, 0.0]], 6, GOLD, PART.GOLD);
  // 注連縄 under the tie beam, tapered to its ends and sagging, with paper hanging from it (火羽 only)
  const RX = 0.285, RN = 44, ry = (x: number) => 0.612 - 0.010*(1 - (x/RX)*(x/RX));
  const rope: V3[] = Array.from({ length: RN + 1 }, (_, i) => { const x = -RX + 2*RX*i/RN; return [x, ry(x), -0.012]; });
  m.tube(rope, t => 0.0070 + 0.0085*Math.pow(Math.sin(Math.PI*t), 0.7), 10, 60, ROPE, PART.ROPE);
  for (const x0 of [-0.205, -0.085, 0.085, 0.205]){
    // 紙垂: a strip folded in four, each fold stepping out to the other side (both faces)
    const top = ry(x0) - 0.012, w = 0.0125, hs = 0.0165;
    for (let i = 0; i < 4; i++){
      const dx = (i%2 ? 1 : -1)*0.0065 + (i >= 2 ? 0.003 : 0), y1 = top - i*hs, y0 = y1 - hs, a: V3 = [x0 + dx - w, y0, -0.012], b: V3 = [x0 + dx + w, y0, -0.012], c: V3 = [x0 + dx + w, y1, -0.012], d: V3 = [x0 + dx - w, y1, -0.012];
      const f: V3 = [0, 0, -1], g: V3 = [0, 0, 1];
      m.quad(a, b, c, d, f, f, f, f, PAPER, PART.PAPER); m.quad(a, b, c, d, g, g, g, g, PAPER, PART.PAPER);
    }
  }
  snowCap(m, SHAPE.kasaX + 0.01, x => SHAPE.kasaY0 + kasaRise(x) + 0.056, x => 0.052*(1 + 0.22*Math.abs(x)/SHAPE.kasaX), 0.036, 1.3);
  snowCap(m, 0.40, () => SHAPE.nukiY + 0.022, () => 0.021, 0.022, 4.1);
  return m.geo();
}

/** 素木: posts running up into a round log; a tie beam through them. */
export function buildWoodTorii(){
  const m = new Model();
  const PX = 0.30, TOP = 0.935, R = 0.034;
  for (const sx of [-1, 1]) m.lathe(sx*PX, 0, -sx*0.012, 0, [[-0.70, 0.043], [0.2, 0.041], [0.6, 0.038], [TOP, 0.036]], 14, WOOD, PART.WOOD);
  // 笠木: a round log lying across the post heads, its ends cut clean (end grain shaded apart)
  const log: V3[] = Array.from({ length: 9 }, (_, i) => [-0.54 + 1.08*i/8, TOP, 0]);
  const round = Array.from({ length: 12 }, (_, i) => [Math.cos(i*Math.PI/6)*R, Math.sin(i*Math.PI/6)*R]);
  m.sweep(log, Y, Z, round, WOOD, PART.WOOD);
  for (const s of [-1, 1]){
    const c: V3 = [s*0.5405, TOP, 0], n: V3 = [s, 0, 0];
    for (let i = 0; i < 12; i++){ const a = i*Math.PI/6, b = (i + 1)*Math.PI/6; m.tri(c, [c[0], TOP + Math.cos(a)*R*0.98, Math.sin(a)*R*0.98], [c[0], TOP + Math.cos(b)*R*0.98, Math.sin(b)*R*0.98], n, n, n, WOOD, PART.WOOD_END); }
  }
  // 貫: straight through the posts and a little past them
  m.prism([-0.365, 0.70, 0], [0.365, 0.70, 0], Y, Z, chamfer(0.023, 0.015, 0.003), WOOD, PART.WOOD);
  // a short strut from it up to the log, and on it a bare board, both faces, with the night's date in ink
  m.prism([0, 0.712, 0], [0, 0.915, 0], X, Z, chamfer(0.022, 0.0125, 0.003), WOOD, PART.WOOD);
  for (const s of [-1, 1]) m.prism([0, 0.812 - 0.052, s*0.017], [0, 0.812 + 0.052, s*0.017], X, Z, chamfer(0.048, 0.0052, 0.0015), PALE_WOOD, PART.WOOD_BOARD);
  snowCap(m, 0.54, () => TOP + 0.024, () => 0.036, 0.036, 2.7);
  snowCap(m, 0.36, () => 0.70 + 0.019, () => 0.017, 0.020, 5.2);
  return m.geo();
}

/** A far gate: the same outline in a few boxes. Closed like the rest. */
function boxes(list: [number, number, number, number, number, V3, number][]){
  const m = new Model();
  for (const [cx, cy, sx, sy, sz, col, part] of list) m.prism([cx - sx/2, cy, 0], [cx + sx/2, cy, 0], Y, Z, [[-sy/2, -sz/2], [sy/2, -sz/2], [sy/2, sz/2], [-sy/2, sz/2]], col, part);
  return m.geo();
}
export function buildFarRed(){
  const list: [number, number, number, number, number, V3, number][] = [];
  for (const s of [-1, 1]){
    list.push([s*SHAPE.postX, (SHAPE.postTop + 0.165)/2 + 0.02, 0.075, SHAPE.shimaY0 - 0.165, 0.075, RED, PART.POST]);
    list.push([s*SHAPE.postX, -0.2675, 0.085, 0.865, 0.085, BLACK, PART.FOOT]);
  }
  list.push([0, SHAPE.nukiY, 0.84, 0.05, 0.036, RED, PART.TIE], [0, (SHAPE.nukiY + SHAPE.shimaY0)/2, 0.046, SHAPE.shimaY0 - SHAPE.nukiY, 0.032, RED, PART.STRUT], [0, SHAPE.shimaY0 + 0.021, 0.94, 0.042, 0.066, RED, PART.SHIMA], [0, SHAPE.kasaY0 + 0.03, 2*SHAPE.kasaX, 0.06, 0.085, BLACK, PART.KASA]);
  return boxes(list);
}
export function buildFarWood(){
  const list: [number, number, number, number, number, V3, number][] = [];
  for (const s of [-1, 1]) list.push([s*0.30, (0.935 - 0.7)/2, 0.074, 0.935 + 0.7, 0.074, WOOD, PART.WOOD]);
  list.push([0, 0.70, 0.73, 0.046, 0.03, WOOD, PART.WOOD], [0, 0.935, 1.08, 0.068, 0.068, WOOD, PART.WOOD]);
  return boxes(list);
}
/** The hull for the ink line: everything closed and big enough to take a line (not the rope and the paper). */
export function linesOf(g: THREE.BufferGeometry){
  const pos = g.getAttribute('position'), on = g.getAttribute('aOutN'), pt = g.getAttribute('aPart');
  const P: number[] = [], N: number[] = [], A: number[] = [];
  for (let t = 0; t < pos.count; t += 3){
    const part = pt.getX(t);
    if (part === PART.ROPE || part === PART.PAPER || part === PART.WOOD_END || part === PART.SNOW) continue;
    for (let k = 0; k < 3; k++){ const i = t + k; P.push(pos.getX(i), pos.getY(i), pos.getZ(i)); N.push(on.getX(i), on.getY(i), on.getZ(i)); A.push(part); }
  }
  const o = new THREE.BufferGeometry();
  o.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); o.setAttribute('aOutN', new THREE.Float32BufferAttribute(N, 3)); o.setAttribute('aPart', new THREE.Float32BufferAttribute(A, 1));
  return o;
}

/* ---------- the paper lantern (提灯): closed top and bottom, its black rims, a cord up to the tie beam. In lantern units: radius 1, height ±1.3 ---------- */
export function buildLantern(){
  const P: number[] = [], Nn: number[] = [], K: number[] = [];
  const S = 16, rows = [[-1.42, 0.40, 1], [-1.40, 0.62, 1], [-1.15, 0.80, 1], [-1.15, 0.84, 0], [-0.75, 0.97, 0], [-0.3, 1.04, 0], [0.3, 1.04, 0], [0.75, 0.97, 0], [1.15, 0.84, 0], [1.15, 0.80, 1], [1.40, 0.62, 1], [1.42, 0.40, 1]];
  const at = (r: number[], k: number) => [Math.cos(2*Math.PI*k/S)*r[1], r[0], Math.sin(2*Math.PI*k/S)*r[1]];
  const put = (v: number[], n: number[], b: number) => { P.push(v[0], v[1], v[2]); Nn.push(n[0], n[1], n[2]); K.push(b); };
  for (let r = 0; r + 1 < rows.length; r++){
    const a = rows[r], c = rows[r + 1], black = a[2] && c[2] ? 1 : 0;
    const dy = c[0] - a[0], dr = c[1] - a[1], ny = -dr/Math.max(0.01, Math.hypot(dy, dr));
    for (let k = 0; k < S; k++){
      const n0 = [Math.cos(2*Math.PI*k/S), ny, Math.sin(2*Math.PI*k/S)], n1 = [Math.cos(2*Math.PI*(k + 1)/S), ny, Math.sin(2*Math.PI*(k + 1)/S)];
      // (wound outward)
      put(at(a, k), n0, black); put(at(c, k + 1), n1, black); put(at(a, k + 1), n1, black);
      put(at(a, k), n0, black); put(at(c, k), n0, black); put(at(c, k + 1), n1, black);
    }
  }
  // the caps that close it
  for (const [r, sg] of [[rows[0], -1], [rows[rows.length - 1], 1]] as [number[], number][]) for (let k = 0; k < S; k++){
    const c = [0, r[0], 0], n = [0, sg, 0];
    if (sg > 0){ put(c, n, 1); put(at(r, k + 1), n, 1); put(at(r, k), n, 1); } else { put(c, n, 1); put(at(r, k), n, 1); put(at(r, k + 1), n, 1); }
  }
  // the cord
  const cr = 0.07, y0 = 1.42, y1 = 3.7;
  for (let k = 0; k < 4; k++){
    const a = k*Math.PI/2, b = a + Math.PI/2, n0 = [Math.cos(a), 0, Math.sin(a)], n1 = [Math.cos(b), 0, Math.sin(b)];
    const p = (t: number, y: number) => [Math.cos(t)*cr, y, Math.sin(t)*cr];
    put(p(a, y0), n0, 1); put(p(b, y1), n1, 1); put(p(b, y0), n1, 1);
    put(p(a, y0), n0, 1); put(p(a, y1), n0, 1); put(p(b, y1), n1, 1);
  }
  return { P, N: Nn, K };
}
