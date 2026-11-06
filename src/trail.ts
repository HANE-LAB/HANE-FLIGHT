import * as THREE from 'three';
import { fxScene, reduceMotion } from './renderer';
import { trailFrag, trailVert } from './shaders';
import { rnd } from './dom';
import { FIRE, FIRE_AT, PLUME_ASPECT, plumeTex } from './plume';
import { U } from './uniforms';

/* =====================================================================
   TRAIL — the fire feathers she sheds in flight (instanced cards of src/plume.ts's feather, CPU state)
   ===================================================================== */
const N = 300;
const geo = new THREE.InstancedBufferGeometry(); geo.copy(new THREE.PlaneGeometry(1, 1/PLUME_ASPECT) as unknown as THREE.InstancedBufferGeometry); geo.instanceCount = N;
const iPos = new Float32Array(N * 3), iRot = new Float32Array(N * 2), iLife = new Float32Array(N);
geo.setAttribute('iPos', new THREE.InstancedBufferAttribute(iPos, 3));
geo.setAttribute('iRot', new THREE.InstancedBufferAttribute(iRot, 2));
geo.setAttribute('iLife', new THREE.InstancedBufferAttribute(iLife, 1));
const mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms: { tPlume: { value: plumeTex }, uFire: { value: FIRE }, uFireAt: { value: FIRE_AT }, uEmber: U.uEmber }, transparent: true, depthWrite: false, side: THREE.DoubleSide, vertexShader: trailVert, fragmentShader: trailFrag }));
mesh.frustumCulled = false; fxScene.add(mesh);
type F = { p: THREE.Vector3; v: THREE.Vector3; life: number; ph: number };
const S: F[] = Array.from({ length: N }, () => ({ p: new THREE.Vector3(0, -999, 0), v: new THREE.Vector3(), life: 0, ph: rnd(0, 6.28) }));
let next = 0;

export function emitFeather(p: THREE.Vector3, v: THREE.Vector3){
  if (reduceMotion) return;
  const f = S[next++ % N];
  f.p.copy(p).add(new THREE.Vector3(rnd(-0.4, 0.4), rnd(-0.2, 0.2), rnd(-0.4, 0.4)));
  f.v.copy(v).multiplyScalar(0.1).add(new THREE.Vector3(rnd(-0.5, 0.5), rnd(0.2, 0.8), rnd(-0.5, 0.5)));
  f.life = 1;
}
export function updateTrail(dt: number, t: number){
  for (let i = 0; i < N; i++){
    const f = S[i];
    if (f.life > 0){ f.life -= dt * 0.5; f.v.y -= dt * 0.6; f.p.addScaledVector(f.v, dt); f.p.x += Math.sin(t * 3 + f.ph) * dt * 0.8; }
    iPos[i * 3] = f.p.x; iPos[i * 3 + 1] = f.p.y; iPos[i * 3 + 2] = f.p.z;
    iRot[i * 2] = Math.sin(t * 2 + f.ph) * 0.7; iRot[i * 2 + 1] = 0.4 + 0.6 * Math.abs(Math.cos(t * 2.5 + f.ph));
    iLife[i] = Math.max(0, f.life);
  }
  geo.attributes.iPos.needsUpdate = true; geo.attributes.iRot.needsUpdate = true; geo.attributes.iLife.needsUpdate = true;
}
