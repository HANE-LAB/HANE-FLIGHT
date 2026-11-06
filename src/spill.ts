import * as THREE from 'three';
import { fxScene } from './renderer';
import { spillFrag, spillVert, wispVert } from './shaders';
import { iA, iB, iC, rising } from './gates';
import { SKY_KEYS, U, pick } from './uniforms';
import { mulberry32 } from './dom';
import { FORMING, noiseUniform } from './clouds';

/* =====================================================================
   SPILL — the cloud a gate is made of as it comes into being: wisps drawing in along the top beam and the tie beam from out to
   the sides, climbing the posts from the floor, gathering round its head; they hold until the fire has run along the gate, and
   then the wind takes them, out and up (they do not fall: this is cloud, not Voyage's water). Everything is a function of how
   far the gate has come (its iC.x), so a seek or a pause gives the same picture.
   The nearest gates share SLOTS sets of cards; only gates still coming into being have one.
   ===================================================================== */
const SLOTS_N = FORMING;
const P_TOP = 18, P_TIE = 10, POSTS = 16, LOOSE = 8, K = P_TOP + P_TIE + POSTS + LOOSE;
const A = new Float32Array(SLOTS_N*K*4), G = new Float32Array(SLOTS_N*K);
{
  for (let g = 0, i = 0; g < SLOTS_N; g++){
    const r = mulberry32(53);   // every slot the same layout: a gate keeps its wisps when it moves to another slot
    const put = (kind: number, x: number) => { A.set([kind, x, r(), r()], i*4); G[i] = g; i++; };
    for (let k = 0; k < P_TOP; k++) put(0, -1 + 2*(k + r())/P_TOP);
    for (let k = 0; k < P_TIE; k++) put(1, -1 + 2*(k + r())/P_TIE);
    for (let k = 0; k < POSTS; k++) put(2, (k + r())/POSTS);
    for (let k = 0; k < LOOSE; k++) put(3, -1 + 2*(k + r())/LOOSE);
  }
}
const q = new THREE.PlaneGeometry(1, 1), geo = new THREE.InstancedBufferGeometry();
geo.setIndex(q.getIndex()); geo.setAttribute('position', q.getAttribute('position'));
geo.setAttribute('aA', new THREE.InstancedBufferAttribute(A, 4)); geo.setAttribute('aG', new THREE.InstancedBufferAttribute(G, 1));
geo.instanceCount = SLOTS_N*K;
const gA = Array.from({ length: SLOTS_N }, () => new THREE.Vector4(0, -1e4, 0, 0)), gB = Array.from({ length: SLOTS_N }, () => new THREE.Vector2(1, 0));
// (uKeep: one card in ten is never drawn, and nobody can tell. With all of them one crosses the top of the picture as a gate comes at the pace of the long nights, on top of the lantern going by, and a cell of the picture goes over the flash limit: dev/flash.mjs)
const spillMat = new THREE.ShaderMaterial({
  uniforms: { uG: { value: gA }, uQ: { value: gB }, uKeep: { value: 0.9 }, uMist: { value: 0 }, tNoise: noiseUniform(), uFogK: U.uFogK, uCloudLit: U.uCloudLit, uAmb: { value: new THREE.Color(0.1, 0.12, 0.2) }, ...pick('tOcc', 'uFxRes', ...SKY_KEYS) },
  defines: { SLOTS_N },
  vertexShader: spillVert, fragmentShader: spillFrag, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
});
const mesh = new THREE.Mesh(geo, spillMat); mesh.frustumCulled = false; fxScene.add(mesh);

/* ---------- the mist's own wisps, rushing past: what says she is inside the cloud (wisp.vert.glsl) ---------- */
const WISPS = 22, wG = new THREE.InstancedBufferGeometry();
wG.setIndex(q.getIndex()); wG.setAttribute('position', q.getAttribute('position'));
{
  const r = mulberry32(97), W = new Float32Array(WISPS*4);
  for (let i = 0; i < WISPS; i++) W.set([(i + 0.3*r())/WISPS, r(), r(), r()], i*4);
  wG.setAttribute('aW', new THREE.InstancedBufferAttribute(W, 4)); wG.instanceCount = WISPS;
}
const wispMat = new THREE.ShaderMaterial({
  uniforms: { uS: { value: 0 }, uSpan: { value: 620 }, uWisp: { value: 0 }, uKeep: spillMat.uniforms.uKeep, uFogK: U.uFogK, tNoise: noiseUniform(), uCloudLit: U.uCloudLit, uAmb: spillMat.uniforms.uAmb, ...pick('tOcc', 'uFxRes', ...SKY_KEYS) },
  vertexShader: wispVert, fragmentShader: spillFrag, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
});
const wispMesh = new THREE.Mesh(wG, wispMat); wispMesh.frustumCulled = false; fxScene.add(wispMesh);

/** @param mist how thick the mist is; @param amb the cloud's shaded colour; @param s how far she has flown (m); @param wisp how much of the mist's wisps to draw */
export function updateSpill(mist: number, amb: THREE.Color, s: number, wisp: number){
  for (let k = 0; k < SLOTS_N; k++){
    const i = rising[k];
    if (i === undefined){ gB[k].set(1, 0); gA[k].set(0, -1e4, 0, 0); continue; }
    gA[k].set(iA[i*4], iA[i*4 + 1], iA[i*4 + 2], iA[i*4 + 3]); gB[k].set(iB[i*4], iC[i*2]);
  }
  spillMat.uniforms.uMist.value = mist; spillMat.uniforms.uAmb.value.copy(amb);
  wispMat.uniforms.uS.value = s; wispMat.uniforms.uWisp.value = wisp;
}
/** Fewer wisps on a slow device: what is left out costs nothing. */
export const setSpillKeep = (k: number) => { spillMat.uniforms.uKeep.value = k; };
