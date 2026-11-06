import * as THREE from 'three';
import { FullScreenQuad, Pass } from 'three/addons/postprocessing/Pass.js';
import { PHONE, PR, camera, renderer } from './renderer';
import { SKY_KEYS, U, pick } from './uniforms';
import { aboveAt, mistAt, sAt } from './path';
import { JUMP } from './data';
import { cloudCombineFrag, cloudDeckFrag, cloudLightFrag, cloudNoiseFrag, cloudSdfFrag, cloudTopFrag, cloudsFrag, fullscreenVert } from './shaders';
import { KEY_MOON, KEY_SUN } from './sky';
import { W } from './season';

/* =====================================================================
   CLOUDS — the whole world now: a deck of cumulus she flies through, and at the very end comes out of.
   Chosen after a survey (docs/LOOK.md 三) for what runs on a phone and still reads as real cloud: a voxel cloud with its
   lighting baked, read by a short march at low resolution. Everything below is made on the GPU at load, once:
     noise   a tileable 64³ Perlin-Worley volume
     deck    the tile of cloud, 960 m across and 240 m high: heaps from a weather map (cloudtop.frag.glsl), their surfaces
             pushed about by the noise (clouddeck.frag.glsl), kept as a field so the surface can be drawn back at run time
     light   the moon's, the sun's and the sky's light through it (cloudlight.frag.glsl). They never move, so this
             replaces the march toward the light that makes volumetric clouds expensive
     sdf     how far each coarse cell is from any cloud (cloudsdf.frag.glsl), so rays leap across empty air
   Each frame (clouds.frag.glsl) a ray reads one texture per step. Drawn small after the opaque scene, stopped by its
   depth, laid over it by src/post.ts.
   ===================================================================== */
const P = 960, H = 240;                                  // the tile, metres
const VOX = { n: 192, m: 48, block: 3 };
const SIGMA = 0.16;                                      // extinction of the densest cloud, per metre
const SDF_MAX = 240;                                     // metres the distance field reaches
const DECK_Y0 = -36;                                     // the height the tile starts at: its floor's top comes to about the gates' feet
/** Metres ahead of her where a gate starts to condense out of the cloud (the big nights a little sooner), and over how many metres
 *  of her flight it does: about a second and a half at her usual speed. Nothing stands further ahead than this: what lies ahead
 *  is cloud (src/gates.ts). */
export const GATE_RISE = { at: 170, atBig: 190, len: 135 };
/** How many gates can be coming into being at once (with GATE_RISE and the spacing of the nights). */
export const FORMING = 6;

const rt3 = (w: number, h: number, d: number, format: THREE.PixelFormat) => {
  const rt = new THREE.WebGL3DRenderTarget(w, h, d, { format, type: THREE.UnsignedByteType, depthBuffer: false });
  const t = rt.texture; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.wrapR = THREE.ClampToEdgeWrapping; t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false;
  return rt;
};
function layers(rt: THREE.WebGL3DRenderTarget, mat: THREE.ShaderMaterial){
  const q = new FullScreenQuad(mat);
  for (let z = 0; z < rt.depth; z++){ if (mat.uniforms.uLayer) mat.uniforms.uLayer.value = z; renderer.setRenderTarget(rt, z); q.render(renderer); }
  q.dispose();
}
const mat = (fragmentShader: string, uniforms: Record<string, THREE.IUniform>, defines: Record<string, unknown> = {}) => new THREE.ShaderMaterial({ uniforms: { uLayer: { value: 0 }, ...uniforms }, defines, vertexShader: fullscreenVert, fragmentShader, depthTest: false, depthWrite: false });

function bakeNoise(){
  const N = 64, rt = new THREE.WebGL3DRenderTarget(N, N, N, { format: THREE.RGBAFormat, type: THREE.UnsignedByteType, depthBuffer: false });
  const tex = rt.texture; tex.wrapS = tex.wrapT = tex.wrapR = THREE.RepeatWrapping; tex.minFilter = tex.magFilter = THREE.LinearFilter;
  const m = new THREE.ShaderMaterial({ uniforms: { uZ: { value: 0 }, uN: { value: N } }, vertexShader: fullscreenVert, fragmentShader: cloudNoiseFrag, depthTest: false, depthWrite: false });
  const q = new FullScreenQuad(m), prev = renderer.getRenderTarget();
  for (let z = 0; z < N; z++){ m.uniforms.uZ.value = z; renderer.setRenderTarget(rt, z); q.render(renderer); }
  renderer.setRenderTarget(prev); q.dispose(); m.dispose();
  return rt;
}
function bakeDeck(noise: THREE.Texture){
  const prev = renderer.getRenderTarget(), { n, m, block } = VOX;
  // the weather in plan: how high the cloud stands at each place
  const top = new THREE.WebGLRenderTarget(n, n, { format: THREE.RedFormat, type: THREE.UnsignedByteType, depthBuffer: false, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping });
  { const tm = mat(cloudTopFrag, { tNoise: { value: noise } }), q = new FullScreenQuad(tm); renderer.setRenderTarget(top); q.render(renderer); q.dispose(); tm.dispose(); }
  // the field
  const dens = rt3(n, n, m, THREE.RedFormat);
  const dm = mat(cloudDeckFrag, { tNoise: { value: noise }, tTop: { value: top.texture }, uW: { value: 0 }, uRatio: { value: 3 }, uHoverN: { value: H/(P/3) } });
  { const q = new FullScreenQuad(dm); for (let z = 0; z < m; z++){ dm.uniforms.uW.value = (z + 0.5)/m; renderer.setRenderTarget(dens, z); q.render(renderer); } q.dispose(); dm.dispose(); top.dispose(); }
  // the distance field: a coarse grid, relaxed cell by cell
  const cn = Math.round(n/block), cm = Math.round(m/block), cell = P/cn, maxC = Math.round(SDF_MAX/cell);
  let a = rt3(cn, cn, cm, THREE.RedFormat), b = rt3(cn, cn, cm, THREE.RedFormat);
  const init = mat(cloudSdfFrag, { tSrc: { value: dens.texture }, uMaxC: { value: maxC } }, { INIT: 1, BLOCK: block });
  layers(a, init); init.dispose();
  const relax = mat(cloudSdfFrag, { tSrc: { value: null }, uMaxC: { value: maxC } });
  for (let i = 0; i < maxC; i++){ relax.uniforms.tSrc.value = a.texture; layers(b, relax); [a, b] = [b, a]; }
  relax.dispose(); b.dispose();
  // the light
  const li = rt3(n, n, m, THREE.RGBAFormat);
  const lm = mat(cloudLightFrag, { tDensity: { value: dens.texture }, uLayers: { value: m }, uMoonL: { value: KEY_MOON }, uSunL: { value: KEY_SUN }, uP: { value: P }, uH: { value: H }, uSigma: { value: SIGMA } });
  layers(li, lm); lm.dispose();
  // everything a ray reads, in one texture
  const vol = rt3(n, n, m, THREE.RGBAFormat);
  const cm2 = mat(cloudCombineFrag, { tDensity: { value: dens.texture }, tLight: { value: li.texture }, uLayers: { value: m } });
  layers(vol, cm2); cm2.dispose(); dens.dispose(); li.dispose();
  renderer.setRenderTarget(prev);
  return { vol, sdf: a, margin: 1.5*cell };
}
let noiseRT = bakeNoise(), deck = bakeDeck(noiseRT.texture);
/** For tuning from the console (dev/probe.mjs): the deck's targets. */
export const deckDebug = () => ({ noise: noiseRT, deck });
const NOISE_U = { value: noiseRT.texture as THREE.Texture };
/** The tileable 64³ noise, shared: the wisps off the gates read it too. */
export const noiseUniform = () => NOISE_U;
renderer.domElement.addEventListener('webglcontextrestored', () => {
  noiseRT = bakeNoise(); deck = bakeDeck(noiseRT.texture); NOISE_U.value = noiseRT.texture;
  const u = cloudPass.mat.uniforms; u.tVol.value = deck.vol.texture; u.tSdf.value = deck.sdf.texture;
});

/* ---------- the palette: scene values, by the act and the hour ---------- */
type Pal = { key: number[]; top: number[]; bot: number[]; floor: number[] };
// by night the cloud is moonlit silver-blue, never white: white is kept for the moon, the lamps and her
// (floor: what a ray that goes past the deck sees, the far cloud sea in one colour; it must read as more of the same cloud)
const NIGHT: Pal = { key: [0.50, 0.58, 0.84], top: [0.135, 0.17, 0.30], bot: [0.030, 0.042, 0.090], floor: [0.07, 0.09, 0.17] };
const ABOVE: Pal = { key: [0.56, 0.64, 0.90], top: [0.15, 0.19, 0.34], bot: [0.040, 0.055, 0.12], floor: [0.13, 0.16, 0.28] };
const DAWN: Pal = { key: [1.05, 0.62, 0.44], top: [0.36, 0.33, 0.52], bot: [0.10, 0.09, 0.19], floor: [0.26, 0.21, 0.32] };
const RISE: Pal = { key: [1.60, 1.08, 0.72], top: [0.52, 0.52, 0.70], bot: [0.17, 0.16, 0.28], floor: [0.38, 0.33, 0.44] };
const lerpPal = (a: Pal, b: Pal, k: number): Pal => ({ key: a.key.map((v, i) => v + (b.key[i] - v)*k), top: a.top.map((v, i) => v + (b.top[i] - v)*k), bot: a.bot.map((v, i) => v + (b.bot[i] - v)*k), floor: a.floor.map((v, i) => v + (b.floor[i] - v)*k) });
// what the climate does to the night's cloud (src/climate.ts): the key and the shaded colours, multiplied. Warmth pink and gold; a
// clear high summer night the moon at its strongest; a storm nearly black; the cold white
const TINT = {
  sprout: { key: [1.00, 1.04, 0.98], amb: [1.10, 1.26, 1.08] },
  warm: { key: [1.36, 1.00, 1.00], amb: [2.24, 1.42, 1.36] },
  clear: { key: [1.60, 1.52, 1.36], amb: [1.04, 1.08, 1.12] },
  storm: { key: [0.46, 0.38, 0.64], amb: [0.52, 0.44, 0.74] },
  cold: { key: [1.20, 1.38, 1.58], amb: [1.50, 1.76, 2.04] },
  thaw: { key: [1.12, 1.04, 0.98], amb: [1.26, 1.12, 1.04] },
};
function weathered(p: Pal){
  for (const k of ['sprout', 'warm', 'clear', 'storm', 'cold', 'thaw'] as const) if (W[k] > 0) for (let c = 0; c < 3; c++){
    const key = 1 + W[k]*(TINT[k].key[c] - 1), amb = 1 + W[k]*(TINT[k].amb[c] - 1);
    p.key[c] *= key; p.top[c] *= amb; p.bot[c] *= amb; p.floor[c] *= amb;
  }
  for (let c = 0; c < 3; c++) p.key[c] *= W.moon;   // that night's moon
  return p;
}
const smoothstep = THREE.MathUtils.smoothstep;
let lastSim = 0, driftT = 0, boil = 0, rainT = 0;
const FAR_OPEN = 6000;   // how far a ray can see once she has come out of the cloud
// (a phone's cloud image, per CSS pixel: as a share of its pixels it would have nearly four times the rays at a ratio of 2, and a cloud is soft, it looks no different)
const PHONE_CLOUD = 0.525;

export class CloudPass extends Pass {
  rt: THREE.WebGLRenderTarget; mat: THREE.ShaderMaterial; scale = PHONE ? PHONE_CLOUD/PR : 0.5;
  private quad: FullScreenQuad; private oldC = new THREE.Color();
  constructor(depth: THREE.Texture){
    super();
    this.needsSwap = false;
    // two targets: the cloud's light and coverage, and one over the view depth where it has become opaque
    this.rt = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, count: 2 });
    this.mat = new THREE.ShaderMaterial({
      defines: { FORMING, STEPS: 56, REFINE: 3, DETAIL_FAR: '520.0', FOG_STEPS: 10 },
      uniforms: {
        tDepth: { value: depth }, tVol: { value: deck.vol.texture }, tSdf: { value: deck.sdf.texture }, tNoise: NOISE_U,
        uNear: { value: camera.near }, uFar: { value: camera.far }, uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() }, uCamPos: { value: new THREE.Vector3() },
        uDrift: { value: new THREE.Vector2() }, uPxA: { value: 0.002 }, uP: { value: P }, uH: { value: H }, uY0: { value: DECK_Y0 }, uCut: { value: 0.1 }, uCap: { value: 0 }, uCapN: { value: 0 }, uFarT: { value: 2500 },
        uSigma: { value: SIGMA }, uSdfMax: { value: SDF_MAX }, uSdfMargin: { value: deck.margin },
        uTube: { value: 44 }, uFog: { value: 0 }, uFogBase: { value: 0.3 }, uFogFire: { value: 5 }, uFogTop: { value: 90 }, uFogTint: { value: new THREE.Vector3(1, 1, 1) }, uSlot: { value: 45 }, uSlotZ: { value: 0 }, uLampTo: { value: 0 }, uForm: { value: Array.from({ length: FORMING }, () => new THREE.Vector4()) },
        uMoonL: { value: KEY_MOON }, uSunL: { value: KEY_SUN }, uFront: { value: 1e7 }, uKeyC: { value: new THREE.Color() }, uSunKeyC: { value: new THREE.Color() }, uAmbTop: { value: new THREE.Color() }, uAmbBot: { value: new THREE.Color() }, uFloorC: { value: new THREE.Color() },
        uFireA: { value: new THREE.Vector4(0, -1e4, 0, 0) }, uFireK: { value: 0.001 }, uLamp: { value: 0.1 }, uHold: { value: 0.58 }, uHaze: { value: 2600 }, uBolt: { value: new THREE.Vector4(0, 0, 0, 0) }, uBoil: { value: 0 }, uFogRain: { value: new THREE.Vector2(1, 0) },
        ...pick(...SKY_KEYS),
      },
      vertexShader: fullscreenVert, fragmentShader: cloudsFrag, depthTest: false, depthWrite: false, glslVersion: THREE.GLSL3,
    });
    this.quad = new FullScreenQuad(this.mat);
  }
  setSize(w: number, h: number){ this.rt.setSize(Math.max(1, Math.round(w*this.scale)), Math.max(1, Math.round(h*this.scale))); }
  setQuality(scale: number, steps: number){ this.scale = scale; this.mat.defines.STEPS = steps; this.mat.needsUpdate = true; }
  render(r: THREE.WebGLRenderer){
    const u = this.mat.uniforms;
    u.uInvProj.value.copy(camera.projectionMatrixInverse); u.uCamWorld.value.copy(camera.matrixWorld); u.uCamPos.value.copy(camera.position);
    u.uNear.value = camera.near; u.uFar.value = camera.far;
    u.uPxA.value = 2*Math.tan(camera.fov*Math.PI/360)/this.rt.height;   // one pixel of the cloud image, in radians
    r.getClearColor(this.oldC); const oldA = r.getClearAlpha();
    r.setRenderTarget(this.rt); r.setClearColor(0x000000, 0); r.clear(); this.quad.render(r);
    r.setClearColor(this.oldC, oldA);
  }
  dispose(){ this.rt.dispose(); this.mat.dispose(); this.quad.dispose(); }
}
let cloudPass: CloudPass;
export function makeCloudPass(depth: THREE.Texture){ cloudPass = new CloudPass(depth); return cloudPass; }

/**
 * Per frame: the cloud for her day. She is inside the cloud for all the long years: a valley between its walls, its floor under
 * her, mist round her that hides what is ahead; thickest in the two lost years, thinnest and most moonlit near the top of the
 * cloud in the last of them. Only on the night the count jumps does she come out: the sun's light runs along the line, and where
 * it has reached the mist is gone and the towers go down into the sea.
 * @param simT the sim clock, so a pause holds the drift; @param u her day; @param dawn 0 night … 1 the sun is up
 * @param bird where she is; @param fire how strongly she lights the cloud; @param reach how far the flock's light reaches (m)
 * @param gatesTo how far along the line (world z) the gates have come up
 */
export function updateClouds(simT: number, u: number, dawn: number, bird: THREE.Vector3, fire: number, reach: number, gatesTo: number){
  if (!cloudPass) return;
  const v = cloudPass.mat.uniforms, above = aboveAt(u), mist = mistAt(u);
  // the cloud moves with the wind, and its surface boils: the fine noise scrolls up through it (Schneider), hard in a storm. Nothing more to read
  { const dt = Math.max(0, Math.min(1, simT - lastSim)); lastSim = simT; driftT += dt*(1 + 3.0*W.storm + 0.5*W.cold + 0.3*W.warm); boil += dt*(1.2 + 9.0*W.storm); rainT += dt*W.storm; }
  v.uDrift.value.set(driftT*2.2, driftT*0.9);
  v.uBoil.value = boil;
  // in a storm the mist is drawn out up and down and falls: sheets of rain sweeping past, seen far off where no one drop could be
  v.uFogRain.value.set(1 - 0.90*W.storm, rainT*34);
  v.uCut.value = 0.04;
  // the valley opens with the flock, and near the top of the cloud; a clear night opens it, a storm closes it in
  v.uTube.value = (74 + (reach - 24)*1.3)*(1 + 0.6*above)*(1 + 0.34*W.clear + 0.10*W.thaw + 0.06*W.cold - 0.26*W.storm);
  v.uCapN.value = Math.max(0, 1.1*above + 0.20*W.cold + 0.3*W.thaw - 0.75*W.storm*above);
  v.uFog.value = (0.0042 + (0.016 - 0.0042)*mist - 0.0014*above)*Math.max(0.25, 1 + 0.10*W.sprout + 0.10*W.warm - 0.66*W.clear + 0.70*W.storm + 0.10*W.cold - 0.50*W.thaw);
  v.uFogBase.value = 0.30 + 0.70*mist + 0.25*W.warm + 0.25*W.storm;
  v.uFogFire.value = 2 - 1.4*mist;   // (the thicker it is the more of it she lights: held back, or the whole frame goes her colour)
  v.uFogTop.value = 110 + 400*mist + 120*W.warm;
  v.uFarT.value = 2500 - 1900*mist;
  v.uLampTo.value = gatesTo;
  // the mist is the night's own deep blue, darker than the sky behind it; toward dawn it takes the sky's colours as they are
  { const k = smoothstep(dawn, 0.10, 0.70), m = 1 - 0.32*mist, c = W.cold*(1 - 0.6*mist), s = 1 - 0.50*W.storm; v.uFogTint.value.set((0.50*m + 0.50*k)*(1 + 1.12*W.warm + 0.62*c + 0.24*W.thaw)*s, (0.58*m + 0.42*k)*(1 + 0.50*W.warm + 0.54*c + 0.06*W.thaw)*s, (0.76*m + 0.24*k)*(1 + 0.18*W.warm + 0.34*c - 0.04*W.thaw)*s); }
  const night = weathered(lerpPal(NIGHT, ABOVE, above));
  // (before the sun the sea stays dark and cold under the glowing sky, so its light has something to change)
  let p = lerpPal(night, DAWN, 0.5*smoothstep(dawn, 0.20, 0.72));
  p = lerpPal(p, RISE, smoothstep(dawn, 0.72, 1.0));
  // the cloud the sun has not reached keeps the moon's cold light, only dimming toward the twilight's; the sun's is warm
  const gone = smoothstep(dawn, 0.20, 0.72), sun = lerpPal(DAWN, RISE, smoothstep(dawn, 0.72, 1.0));
  v.uKeyC.value.setRGB(night.key[0]*(1 - 0.35*gone), night.key[1]*(1 - 0.40*gone), night.key[2]*(1 - 0.30*gone));
  v.uSunKeyC.value.setRGB(sun.key[0], sun.key[1], sun.key[2]);
  v.uAmbTop.value.setRGB(p.top[0] + 0.05*W.flash, p.top[1] + 0.06*W.flash, p.top[2] + 0.10*W.flash); v.uAmbBot.value.setRGB(p.bot[0], p.bot[1], p.bot[2]); v.uFloorC.value.setRGB(p.floor[0], p.floor[1], p.floor[2]);
  // lightning in a tower
  v.uBolt.value.set(W.boltX, W.boltTop, W.boltZ, 4.2*W.flash);
  // 日の目を見る: on the night the count jumps the sun's light starts at the horizon and runs along the cloud sea to her and on
  // past her, about fourteen seconds at that pace. Before it all the cloud is in the moon's light, after it all in the sun's
  const run = (u - (JUMP - 0.5))/6.5;
  v.uFront.value = run <= 0 ? 1e7 : run >= 1 ? -1e7 : sAt(u) + 3800 - 4300*Math.pow(run, 1.4);
  const lit = run >= 1 ? 1 : Math.max(0, run);
  v.uCap.value = run > 0 ? 1.45 : 0;
  v.uFarT.value = v.uFarT.value + (FAR_OPEN - v.uFarT.value)*smoothstep(run, 0, 0.3);
  v.uHaze.value = 1500 + 1900*smoothstep(run, 0, 0.6);   // (and then the sea runs on to the horizon)
  v.uHold.value = 0.58 + 0.24*smoothstep(dawn, 0.68, 1.0) + 0.24*W.flash;   // (for that moment the cloud may bloom)
  v.uLamp.value = 0.11*(1 - 0.8*smoothstep(dawn, 0.7, 1.0))*(1 + 0.9*W.warm + 0.3*W.clear - 0.3*W.cold);
  v.uFireA.value.set(bird.x, bird.y, bird.z, fire);
  { const r = 15 + 0.30*(reach - 24); v.uFireK.value = 1/(r*r); }   // her own pool of light, wider with the flock's
  const c = (k: number) => (night.key[k] + (sun.key[k] - night.key[k])*lit)*0.62 + p.top[k]*0.5;
  U.uCloudLit.value.setRGB(c(0), c(1), c(2));
}
