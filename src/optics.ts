import * as THREE from 'three';
import { Pass } from 'three/addons/postprocessing/Pass.js';
import { camera, renderer, RT_TYPE } from './renderer';
import { U } from './uniforms';
import { fullscreenVert, opticsBakeFrag, opticsGhostFrag, opticsGhostVert, opticsSeenFrag, opticsStarFrag, opticsStarVert } from './shaders';
import { mulberry32, smooth } from './dom';

/* =====================================================================
   OPTICS — what the sun does inside the lens. Everything else on the page is drawn as the eye sees the world; this is what the glass adds, so it comes after the bloom and before the tone curve.
   Worked out from the lens, not painted, and all of it once, at load. What runs each frame is one read of a picture and a dozen small cards.
   - The star (Kakimoto et al. 2005, wave optics): light far from an aperture is the Fourier transform of the aperture. So: draw the aperture, take its FFT, and the squared size of that is the glare. It scales with the wavelength,
     so summing the one picture over the spectrum gives its colours (Wyman, Sloan & Shirley 2013's fit to the CIE curves). What is in the aperture is what later work on the eye added to his pupil and lashes: six blades and a few
     hairs, which give the long needles; some hundreds of specks, whose patterns, scaled by the wavelength, line up into the fine radial needles (van den Berg et al. 2005); rings like the lens's fibres, a grating, which give the
     coloured ring round the sun (Ritschel et al. 2009); and a phase growing with the square of the radius, Ritschel's Fresnel term, kept small: a little out of focus, which spreads the light of the needles out into many.
   - The ghosts (Hullin et al. 2011; Lee & Eisemann 2013): light that reflects off two surfaces of the lens on its way through, and lands somewhere else. To first order (ray transfer matrices) each
     pair of surfaces gives a copy of the aperture at a fixed multiple of where the sun is on the sensor, of a fixed size, per colour; how much light by the anti-reflection coating on the two surfaces,
     a thin film, and by how much of the sun's beam the stop lets through. The lens is a real one: D-GAUSS F/2, US patent 2,673,491 (Tronnier), as Kolb et al. 1995 and pbrt give it, f = 50 mm, its pairs reduced to the brightest.
   - The veil (Vos and van den Berg; CIE 2002): the light scattered inside the eye or the glass round a bright source falls off with the angle as 10/θ³ + 5/θ², in degrees, and it is written so.
   - How much of the sun gets through: read from the picture itself, the disc's brightness at a few points, so clouds, gates and birds all count without knowing about them. Moving light may only be
     added smoothly, and a post or a beam crossing the sun would be a flash over the whole frame: so it eases, on a one-pixel target kept on the GPU (dev/flash.mjs).
   ===================================================================== */
const N = 512;
const mono = new THREE.DataTexture(new Uint8Array(N*N), N, N, THREE.RedFormat, THREE.UnsignedByteType);
mono.minFilter = mono.magFilter = THREE.LinearFilter;

/** The aperture's far field, |FT(aperture)|², with its fourth root in 8 bits: its range is far too wide for them otherwise, and the eye only needs the root. */
function farField(){
  const re = new Float32Array(N*N), im = new Float32Array(N*N), r = mulberry32(11), D = 200, R0 = D/2, c = N/2, BLADES = 6, TURN = 0.26;
  const hairs = Array.from({ length: 5 }, () => { const a = r()*Math.PI, off = (r() - 0.5)*D*0.9; return [Math.cos(a), Math.sin(a), off, (0.5 + r()*0.8)*0.6]; });
  const specks = Array.from({ length: 900 }, () => { const a = r()*2*Math.PI, q = Math.sqrt(r())*R0, s = (0.6 + r()*r()*3)*0.7; return [q*Math.cos(a), q*Math.sin(a), s]; });
  const RING = 8, OUT_OF_FOCUS = 1.5;   // (texels between the rings, so the ring round the sun is N/RING from it; wavelengths of phase at the rim)
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++){
    const px = x - c + 0.5, py = y - c + 0.5, rho = Math.hypot(px, py);
    if (rho > R0*1.2) continue;
    let edge = R0*1.05 - rho;
    for (let k = 0; k < BLADES; k++){ const a = (k + 0.5)*2*Math.PI/BLADES + TURN; edge = Math.min(edge, R0 - (px*Math.cos(a) + py*Math.sin(a))); }
    let A = Math.max(0, Math.min(1, edge + 0.5));
    for (const h of hairs) A *= Math.min(1, Math.max(0, Math.abs(px*h[0] + py*h[1] - h[2]) - h[3] + 0.5));
    // (the fibres matter only in the lens's outer part)
    A *= 1 - 0.5*Math.min(1, Math.max(0, (rho/R0 - 0.45)/0.15))*(0.5 + 0.5*Math.cos(2*Math.PI*rho/RING));
    re[y*N + x] = A;
  }
  for (const s of specks){
    const x0 = Math.floor(c - 0.5 + s[0] - s[2] - 1), x1 = Math.ceil(c - 0.5 + s[0] + s[2] + 1), y0 = Math.floor(c - 0.5 + s[1] - s[2] - 1), y1 = Math.ceil(c - 0.5 + s[1] + s[2] + 1);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) re[y*N + x] *= Math.min(1, Math.max(0, Math.hypot(x - c + 0.5 - s[0], y - c + 0.5 - s[1]) - s[2] + 0.5));
  }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++){
    const A = re[y*N + x];
    if (A <= 0) continue;
    const u = Math.hypot(x - c + 0.5, y - c + 0.5)/R0, ph = 2*Math.PI*OUT_OF_FOCUS*u*u;
    re[y*N + x] = A*Math.cos(ph); im[y*N + x] = A*Math.sin(ph);
  }
  const fft = (off: number, step: number) => {
    for (let i = 1, j = 0; i < N; i++){ let bit = N >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j){ const a = off + i*step, b = off + j*step; let t = re[a]; re[a] = re[b]; re[b] = t; t = im[a]; im[a] = im[b]; im[b] = t; } }
    for (let len = 2; len <= N; len <<= 1){
      const ang = -2*Math.PI/len, wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < N; i += len){
        let cr = 1, ci = 0;
        for (let k = 0; k < len/2; k++){
          const a = off + (i + k)*step, b = a + (len/2)*step, xr = re[b]*cr - im[b]*ci, xi = re[b]*ci + im[b]*cr;
          re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
          const t = cr*wr - ci*wi; ci = cr*wi + ci*wr; cr = t;
        }
      }
    }
  };
  for (let y = 0; y < N; y++) fft(y*N, 1);
  for (let x = 0; x < N; x++) fft(x, N);
  let most = 0;
  for (let i = 0; i < N*N; i++){ const v = re[i]*re[i] + im[i]*im[i]; re[i] = v; if (v > most) most = v; }
  const out = mono.image.data as Uint8Array;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) out[((y + c)%N)*N + (x + c)%N] = Math.round(255*Math.sqrt(Math.sqrt(re[y*N + x]/most)));
  mono.needsUpdate = true;
}

/* ---------- the colours: the one picture summed over the spectrum, into an 8-bit picture of the fourth root again, on the GPU ---------- */
const LAMBDA = Array.from({ length: 24 }, (_, i) => 410 + 12.6*i);
const gauss = (x: number, m: number, s1: number, s2: number) => { const t = (x - m)*(x < m ? s1 : s2); return Math.exp(-0.5*t*t); };
const sRGB = (l: number) => {
  const X = 1.056*gauss(l, 599.8, 0.0264, 0.0323) + 0.362*gauss(l, 442, 0.0624, 0.0374) - 0.065*gauss(l, 501.1, 0.0490, 0.0382);
  const Y = 0.821*gauss(l, 568.8, 0.0213, 0.0247) + 0.286*gauss(l, 530.9, 0.0613, 0.0322);
  const Z = 1.217*gauss(l, 437, 0.0845, 0.0278) + 0.681*gauss(l, 459, 0.0385, 0.0725);
  return new THREE.Vector3(3.2406*X - 1.5372*Y - 0.4986*Z, -0.9689*X + 1.8758*Y + 0.0415*Z, 0.0557*X - 0.2040*Y + 1.0570*Z);
};
const weights = LAMBDA.map(sRGB), total = weights.reduce((a, b) => a.clone().add(b), new THREE.Vector3());
weights.forEach(w => w.divide(total));
const starRT = new THREE.WebGLRenderTarget(N, N, { minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: true, depthBuffer: false });
const quadGeo = new THREE.PlaneGeometry(2, 2), still = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
function bakeStar(){
  const s = new THREE.Scene(), m = new THREE.Mesh(quadGeo, new THREE.ShaderMaterial({ uniforms: { tMono: { value: mono }, uScale: { value: LAMBDA.map(l => 550/l) }, uWeight: { value: weights } }, depthTest: false, depthWrite: false, vertexShader: fullscreenVert, fragmentShader: opticsBakeFrag }));
  const prev = renderer.getRenderTarget(); s.add(m); renderer.setRenderTarget(starRT); renderer.render(s, still); renderer.setRenderTarget(prev);
  m.material.dispose();
}

/* ---------- the ghosts: ray transfer matrices through the lens. Each row: radius, thickness to the next surface, index after it (1 is air), clear diameter; the sixth is the stop ---------- */
const LENS = [[29.475, 3.76, 1.67, 25.2], [84.83, 0.12, 1, 25.2], [19.275, 4.025, 1.67, 23], [40.77, 3.275, 1.699, 23], [12.75, 5.705, 1, 18], [0, 4.5, 1, 17.1], [-14.495, 1.18, 1.603, 17], [40.77, 6.065, 1.658, 20], [-20.385, 0.19, 1, 20], [437.065, 3.22, 1.717, 20], [-39.73, 0, 1, 20]];
const ABBE: Record<number, number> = { 1.67: 47.1, 1.699: 30.1, 1.603: 38, 1.658: 57.3, 1.717: 48 }, STOP = 5, S = LENS.length;
// (each surface its own coating, tuned somewhere in the visible: what gives the ghosts their different colours)
const COAT = [430, 520, 610, 470, 560, 0, 500, 590, 450, 540, 620];
type M2 = [number, number, number, number];
const mul = (a: M2, b: M2): M2 => [a[0]*b[0] + a[1]*b[2], a[0]*b[1] + a[1]*b[3], a[2]*b[0] + a[3]*b[2], a[2]*b[1] + a[3]*b[3]];
const go = (d: number): M2 => [1, d, 0, 1];
const bend = (n1: number, n2: number, r: number): M2 => r === 0 ? [1, 0, 0, n1/n2] : [1, 0, -(n2 - n1)/(r*n2), n1/n2];
const mirror = (r: number): M2 => r === 0 ? [1, 0, 0, 1] : [1, 0, 2/r, 1];
const indexAt = (nd: number, l: number) => nd === 1 ? 1 : nd + (nd - 1)/ABBE[nd]*(1/(l*l) - 1/(587.6*587.6))/(1/(486.1*486.1) - 1/(656.3*656.3));
/** Through the surfaces after i, up to and through j. */
const on = (i: number, j: number, n: number[]) => { let m: M2 = [1, 0, 0, 1]; for (let k = i + 1; k <= j; k++){ if (k > 0) m = mul(go(LENS[k - 1][1]), m); m = mul(bend(n[k], n[k + 1], LENS[k][0]), m); } return m; };
/** Back, from a reflection off a to just short of a reflection off b. */
const back = (a: number, b: number, n: number[]) => { let m: M2 = [1, 0, 0, 1]; for (let k = a - 1; k > b; k--){ m = mul(go(LENS[k][1]), m); m = mul(bend(n[k + 1], n[k], -LENS[k][0]), m); } return mul(go(LENS[b][1]), m); };
/** A single-layer film of a quarter wave at l0 between two glasses (a thin film, at normal incidence): how much it reflects at l. */
const reflects = (n1: number, n2: number, l: number, l0: number) => {
  const nc = Math.max(1.38, Math.sqrt(n1*n2)), r1 = (n1 - nc)/(n1 + nc), r2 = (nc - n2)/(nc + n2), ph = Math.PI*l0/l, c = Math.cos(ph), s = Math.sin(ph);
  const re = r1 + r2*c, im = r2*s, dr = 1 + r1*r2*c, di = r1*r2*s;
  return (re*re + im*im)/(dr*dr + di*di);
};
const RGB_NM = [640, 550, 460];
// (the lens stopped down, to about f/5: wide open a ghost is half the frame, and the picture goes milky)
const STOPPED = 0.4;
/** Each ghost: where it falls as a multiple of where the sun is, its radius over the focal length, how bright, which is how much of the beam gets through (1/Ma[0]²) over its area; for red, green and blue. */
function ghosts(){
  const found: { k: number[]; r: number[]; e: number[] }[] = [];
  for (let a = 1; a < S; a++) for (let b = 0; b < a; b++){
    // (a pair either side of the stop crosses it three times and is clipped nearly away)
    if (a === STOP || b === STOP || (a > STOP && b < STOP)) continue;
    const g = { k: [] as number[], r: [] as number[], e: [] as number[] };
    for (const l of RGB_NM){
      const n = [1, ...LENS.map(row => indexAt(row[2], l))], whole = on(-1, S - 1, n), f = -1/whole[2], bfl = -whole[0]/whole[2];
      const bounce = (from: number, to: number): M2 => { let m = mul(go(LENS[a - 1][1]), on(from, a - 1, n)); m = mul(mirror(LENS[a][0]), m); m = mul(back(a, b, n), m); m = mul(mirror(-LENS[b][0]), m); return mul(on(b, to, n), m); };
      const Ma = a < STOP ? bounce(-1, STOP) : on(-1, STOP, n), Ms = mul(go(bfl), a < STOP ? on(STOP, S - 1, n) : bounce(STOP, S - 1));
      const size = Math.abs(Ms[0] + Ms[1]*Ma[2]/Ma[0])*LENS[STOP][3]/2*STOPPED/Math.abs(f), det = Ma[0]*Ma[3] - Ma[1]*Ma[2];
      g.k.push(Ms[1]*det/Ma[0]/mul(go(bfl), whole)[1]); g.r.push(size);
      g.e.push(reflects(n[a], n[a + 1], l, COAT[a])*reflects(n[b], n[b + 1], l, COAT[b])/(Ma[0]*Ma[0]*size*size + 1e-5));
    }
    found.push(g);
  }
  // (the brightest; and not the ones as wide as the frame, which are only a veil)
  return found.filter(g => g.r[1] < 0.5).sort((p, q) => q.e[0] + q.e[1] + q.e[2] - p.e[0] - p.e[1] - p.e[2]).slice(0, 11);
}

/* ---------- the pass ---------- */
const SUN = { uSun: { value: new THREE.Vector2() }, uAspect: { value: 1 }, uAmt: { value: 0 }, uScale: { value: 1 }, uSize: { value: 1.25 }, uTint: { value: new THREE.Color(1, 0.8, 0.6) } };
// (half float whatever the scene's target is, as the clouds' are: an easing by small amounts would stick in 8 bits)
const seenRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false });
const seenMat = new THREE.ShaderMaterial({ uniforms: { tScene: { value: null as THREE.Texture | null }, uSunUv: { value: new THREE.Vector2() }, uDisc: { value: new THREE.Vector2() }, uLit: { value: RT_TYPE === THREE.HalfFloatType ? new THREE.Vector2(0.9, 1.2) : new THREE.Vector2(0.72, 0.95) }, uOff: { value: 0 }, uClear: { value: 0 }, uEase: { value: 1 } }, transparent: true, blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor, depthTest: false, depthWrite: false, vertexShader: fullscreenVert, fragmentShader: opticsSeenFrag });
const seenScene = new THREE.Scene(), seenQuad = new THREE.Mesh(quadGeo, seenMat); seenQuad.frustumCulled = false; seenScene.add(seenQuad);
const glassScene = new THREE.Scene();
const additive = { transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false };
const star = new THREE.Mesh(quadGeo, new THREE.ShaderMaterial({ ...additive, uniforms: { ...SUN, tStar: { value: starRT.texture }, tSeen: { value: seenRT.texture } }, vertexShader: opticsStarVert, fragmentShader: opticsStarFrag }));
star.frustumCulled = false; glassScene.add(star);
const ghostGeo = new THREE.InstancedBufferGeometry();
ghostGeo.setIndex(quadGeo.getIndex()); ghostGeo.setAttribute('position', quadGeo.getAttribute('position'));
{
  const G = ghosts(), K = new Float32Array(G.length*3), R = new Float32Array(G.length*3), E = new Float32Array(G.length*3), most = Math.max(...G.flatMap(g => g.e));
  // (the range of how bright they are is far wider than a picture holds: the eye's root of how much, but each keeps its colour)
  G.forEach((g, i) => { const big = Math.max(...g.e), k = Math.pow(big/most, 0.42)/big; K.set(g.k, i*3); R.set(g.r, i*3); E.set(g.e.map(e => e*k), i*3); });
  ghostGeo.setAttribute('iK', new THREE.InstancedBufferAttribute(K, 3)); ghostGeo.setAttribute('iR', new THREE.InstancedBufferAttribute(R, 3)); ghostGeo.setAttribute('iE', new THREE.InstancedBufferAttribute(E, 3));
  ghostGeo.instanceCount = G.length;
}
const ghostMesh = new THREE.Mesh(ghostGeo, new THREE.ShaderMaterial({ ...additive, uniforms: { ...SUN, tSeen: { value: seenRT.texture } }, vertexShader: opticsGhostVert, fragmentShader: opticsGhostFrag }));
ghostMesh.frustumCulled = false; glassScene.add(ghostMesh);

// (the glass has a target of its own at half the size, which the grade pass adds in: it is all soft, a quarter of the pixels, and a tile-based GPU does not have to load the whole scene back to draw on it)
const glassRT = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
export const glassTex = glassRT.texture;
const at = new THREE.Vector3();
// (the disc is about 1.4° across its radius: sky.frag.glsl)
const DEG = Math.PI/180, DISC = Math.tan(1.15*DEG);
export class OpticsPass extends Pass {
  /** Whether the grade pass is to add the glass in. */
  on = { value: 0 };
  constructor(){ super(); this.needsSwap = false; }
  setSize(w: number, h: number){ glassRT.setSize(Math.max(1, Math.round(w/2)), Math.max(1, Math.round(h/2))); }
  render(gl: THREE.WebGLRenderer, _write: THREE.WebGLRenderTarget, read: THREE.WebGLRenderTarget, dt: number){
    const up = U.uSunAmt.value;
    at.copy(U.uSunDir.value).multiplyScalar(1000).add(camera.position).project(camera);
    const inFront = at.z < 1, far = Math.max(Math.abs(at.x), Math.abs(at.y));
    const edge = 1 - Math.min(1, Math.max(0, (far - 1)/0.7));
    this.on.value = 0;
    if (up <= 0.001 || !inFront || edge <= 0) return;
    const autoClear = gl.autoClear, clearA = gl.getClearAlpha(); gl.getClearColor(WAS); gl.autoClear = false;
    // how much of the disc is getting through, eased
    const half = Math.tan(camera.fov*Math.PI/360), u = seenMat.uniforms;
    u.tScene.value = read.texture; u.uSunUv.value.set(at.x*0.5 + 0.5, at.y*0.5 + 0.5); u.uDisc.value.set(DISC/half/2/camera.aspect, DISC/half/2);
    u.uOff.value = far > 0.97 ? 1 : 0; u.uClear.value = smooth(Math.asin(U.uSunDir.value.y), -1.5*DEG, DEG); u.uEase.value = 1 - Math.exp(-dt/0.22);
    gl.setRenderTarget(seenRT); gl.render(seenScene, still);
    // the glass
    SUN.uSun.value.set(at.x*camera.aspect, at.y); SUN.uAspect.value = camera.aspect; SUN.uScale.value = 1/half;
    // (no glass before there is a sun: a bright bird crossing the place where it will rise is not one)
    SUN.uAmt.value = Math.sqrt(up)*smooth(up, 0.3, 0.36)*edge;
    // (its size goes with the lens's width, as src/camera.ts holds it on a tall screen; upright on a phone the star would otherwise be more than twice as large against everything else)
    SUN.uSize.value = 1.25*Math.min(1, camera.aspect/1.2);
    SUN.uTint.value.copy(U.uSunC.value).lerp(WHITE, 0.45);
    gl.setRenderTarget(glassRT); gl.setClearColor(BLACK, 1); gl.clear(true, false, false); gl.render(glassScene, still);
    gl.setClearColor(WAS, clearA);
    gl.autoClear = autoClear;
    this.on.value = 1;
  }
}
const WHITE = new THREE.Color(1, 1, 1), BLACK = new THREE.Color(0, 0, 0), WAS = new THREE.Color();
// (and one draw of each now, with nothing to show, so that they are compiled before the sun comes up: a stall then, in the middle of the flight, would be seen)
const warmUp = () => { const prev = renderer.getRenderTarget(); renderer.setRenderTarget(seenRT); renderer.render(seenScene, still); renderer.setRenderTarget(glassRT); renderer.render(glassScene, still); renderer.setRenderTarget(prev); };
farField(); bakeStar(); warmUp();
renderer.domElement.addEventListener('webglcontextrestored', () => { mono.needsUpdate = true; bakeStar(); warmUp(); });
