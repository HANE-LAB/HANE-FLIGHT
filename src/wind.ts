import * as THREE from 'three';
import { mulberry32 } from './dom';

/* =====================================================================
   WIND — turbulence in closed form, for what is in the air (air.vert.glsl). Kinematic simulation (Fung, Hunt, Malik & Perkins 1992):
   a handful of Fourier modes, each divergence-free by construction (its amplitude square to its wave vector, so nothing gathers in
   sinks, as plain noise does), with Kolmogorov's spectrum E(k) ~ k^(-5/3) and each eddy turning over at its own rate, ω ~ k^(2/3).
   Carried along by the mean wind as a frozen pattern (Taylor 1938). What a particle gets is the displacement, the velocity
   integrated along its path, so large eddies carry it far and small ones only shake it, A ~ 1/k.
   No state and no texture: a few sines per vertex, and neighbours move together, which is what makes a gust read as a gust.
   ===================================================================== */
const N = 6, K0 = 0.09, K1 = 1.05;   // rad per metre: eddies from about 70 m down to 6 m
const r = mulberry32(73);
export const WIND_K: THREE.Vector4[] = [];   // the wave vector; a phase
export const WIND_A: THREE.Vector4[] = [];   // the displacement's amplitude and direction, at most 1; ω
{
  const k = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3();
  for (let n = 0; n < N; n++){
    const kn = K0*Math.pow(K1/K0, n/(N - 1)), z = 2*r() - 1, th = 2*Math.PI*r(), s = Math.sqrt(1 - z*z);
    k.set(s*Math.cos(th), z, s*Math.sin(th));
    b.set(r() - 0.5, r() - 0.5, r() - 0.5);
    a.crossVectors(k, b).normalize().multiplyScalar(K0/kn);   // square to k: divergence-free
    WIND_K.push(new THREE.Vector4(kn*k.x, kn*k.y, kn*k.z, 2*Math.PI*r()));
    WIND_A.push(new THREE.Vector4(a.x, a.y, a.z, 0.45*Math.pow(kn/K0, 2/3)));
  }
}
/** The gust: how the mean wind comes and goes (a few slow sines, in the same proportions), and how far that has carried the air. */
const G = [[0.31, 0], [0.83, 1], [2.1, 2]] as const, GA = [1, 0.5, 0.2];
export const gust = (t: number) => { let s = 0; G.forEach(([w, p], i) => { s += GA[i]*Math.sin(w*t + p); }); return s/1.7; };
export const gustPath = (t: number) => { let s = 0; G.forEach(([w, p], i) => { s -= GA[i]*Math.cos(w*t + p)/w; }); return s/1.7; };
