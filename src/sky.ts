import * as THREE from 'three';
import { camera, reduceMotion, renderer, scene } from './renderer';
import { milkywayVert, milkywayFrag, skyFrag, skyVert, starsFrag, starsVert } from './shaders';
import { U, pick } from './uniforms';
import { EAST, aboveAt, mistAt, tangentAt } from './path';
import { mulberry32, smooth } from './dom';
import { W } from './season';

/* =====================================================================
   SKY — a hand-set analytic sky (src/shaders/chunks/sky.glsl), its colours keyed to the flight: deep ultramarine among the
   towers (never black: the horizon stays about 25 L* above what stands against it), the mist's own gradient in the two
   lost years, a value inversion near the top of the cloud (the cloud brighter than the horizon, the horizon brighter than the
   zenith), and in the last nights the twilight: purple light ahead, Earth's shadow and the Belt of Venus behind, then the
   sun, dead ahead along the line. The stars are drawn by magnitude and colour temperature; the Milky Way is Voyage's.
   Colours are written as the display colours wanted (the research palettes) and brought back through the tone curve.
   ===================================================================== */
// display colour → scene value: the inverse of grade.frag.glsl's tone curve, per channel
const inv = (y: number) => { const a = 2.51 - 2.43*y, b = 0.03 - 0.59*y, c = -0.14*y; return (-b + Math.sqrt(b*b - 4*a*c))/(2*a); };
// (each channel held under 0.93 first: the curve flattens toward 1, so a channel at ff came back about 7 times too
// strong and every warm colour of the sunrise turned pure red once the sky was held under the bloom threshold)
const C = (hex: string) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16 & 255)/255, (n >> 8 & 255)/255, (n & 255)/255].map(v => inv(Math.min(v, 0.93))); };
/** A display colour (#rrggbb) as the scene value that comes out as it after the grade's tone curve. */
export const fromDisplay = (hex: string) => C(hex) as [number, number, number];
type Pal = Record<'zen' | 'mid' | 'hor' | 'horW' | 'warm' | 'purple' | 'shadow' | 'belt' | 'sunGlow' | 'moonGlow', number[]>;
const pal = (p: Record<keyof Pal, string>): Pal => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, C(v)])) as Pal;
const TOWERS = pal({ zen: '#0d1433', mid: '#1a2550', hor: '#3b4a7a', horW: '#3e3a5c', warm: '#3b4a7a', purple: '#1a2550', shadow: '#3b4a7a', belt: '#3b4a7a', sunGlow: '#000000', moonGlow: '#8a98c8' });
const ABOVE = pal({ zen: '#060b20', mid: '#0f1838', hor: '#46578a', horW: '#2c3760', warm: '#46578a', purple: '#0f1838', shadow: '#46578a', belt: '#46578a', sunGlow: '#000000', moonGlow: '#9aa8d8' });
const TW6 = pal({ zen: '#2a3570', mid: '#4a4f8e', hor: '#7a6aa0', horW: '#3c4678', warm: '#f08a5e', purple: '#a77aa8', shadow: '#3c4678', belt: '#8c6c95', sunGlow: '#a0503a', moonGlow: '#20243a' });
const TW2 = pal({ zen: '#3a4683', mid: '#6a6aa6', hor: '#b08aa8', horW: '#59628f', warm: '#ffab6b', purple: '#cf96a8', shadow: '#59628f', belt: '#c28fa2', sunGlow: '#e07a48', moonGlow: '#000000' });
const RISE = pal({ zen: '#3f5ea6', mid: '#7682b4', hor: '#d8a890', horW: '#8c86a8', warm: '#ff9e58', purple: '#e0a890', shadow: '#7a76a0', belt: '#c88a78', sunGlow: '#ff9a50', moonGlow: '#000000' });
const MIST_TOP = C('#7a84a3'), MIST_BOT = C('#3d4560');
const lerpPal = (a: Pal, b: Pal, t: number): Pal => Object.fromEntries(Object.keys(a).map(k => [k, a[k as keyof Pal].map((v, i) => v + (b[k as keyof Pal][i] - v)*t)])) as Pal;
// what the climate does to the night sky (src/climate.ts): the zenith, the middle, the horizon, multiplied. Warmth rosy and gold
// down to the horizon (the mist takes the sky's colour, so it goes that way too); a clear night deep and clean; a storm nearly black;
// the cold pale and flat; a thaw a little warmth low down
const TINT = {
  sprout: [[1.00, 1.08, 1.04], [1.12, 1.26, 1.10], [1.34, 1.52, 1.16]],
  warm: [[1.86, 1.24, 1.12], [2.90, 1.56, 1.20], [4.20, 2.10, 1.34]],
  clear: [[0.66, 0.76, 1.00], [0.74, 0.86, 1.04], [1.00, 1.08, 1.14]],
  storm: [[0.34, 0.27, 0.46], [0.36, 0.28, 0.50], [0.40, 0.30, 0.56]],
  cold: [[1.16, 1.40, 1.56], [1.36, 1.66, 1.82], [1.80, 2.10, 2.20]],
  thaw: [[0.96, 1.00, 1.06], [1.14, 1.06, 1.06], [2.30, 1.50, 1.10]],
};
const BANDS: (keyof Pal)[][] = [['zen'], ['mid'], ['hor', 'horW']];
function weathered(p: Pal){
  for (const k of ['sprout', 'warm', 'clear', 'storm', 'cold', 'thaw'] as const) if (W[k] > 0) BANDS.forEach((keys, b) => { for (const key of keys) for (let c = 0; c < 3; c++) p[key][c] *= 1 + W[k]*(TINT[k][b][c] - 1); });
  // a strike lights the whole sky a little
  if (W.flash > 0) for (const key of ['zen', 'mid', 'hor', 'horW'] as const) { p[key][0] += 0.035*W.flash; p[key][1] += 0.042*W.flash; p[key][2] += 0.08*W.flash; }
  return p;
}

// The moon stands high in the frame, ahead and to the left of her, clear of the gates she flies through. Being so far off it keeps
// nearly abreast of her as the line curves. The key light is on its side, but further round and higher: the cloud is seen side-lit,
// half in light and half in shade, which is what shows a cloud's shape; lit from straight ahead it would all be its dark side. The
// sun comes up dead ahead.
const aE = Math.atan2(EAST.z, EAST.x), eM = 16.5*Math.PI/180;
const toward = (a: number, e: number) => new THREE.Vector3(Math.cos(a)*Math.cos(e), Math.sin(e), Math.sin(a)*Math.cos(e));
/** The two light directions the cloud's light was baked for (src/clouds.ts). */
export const KEY_MOON = toward(aE - 1.45, 34*Math.PI/180), KEY_SUN = toward(aE + 0.55, 11*Math.PI/180);

/* ---------- Milky Way, rendered once into an equirectangular texture (Voyage) ---------- */
const mwRT = new THREE.WebGLRenderTarget(2048, 1024, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.RepeatWrapping, wrapT: THREE.ClampToEdgeWrapping, depthBuffer: false });
const BAND_N = new THREE.Vector3(), E1 = new THREE.Vector3(), E2 = new THREE.Vector3();
{ const a = new THREE.Vector3(Math.cos(aE + 1.2), 0.10, Math.sin(aE + 1.2)).normalize(), b = new THREE.Vector3(Math.cos(aE - 0.6)*0.5, 1, Math.sin(aE - 0.6)*0.5).normalize(); BAND_N.crossVectors(a, b).normalize(); E1.copy(a); E2.crossVectors(BAND_N, E1).normalize(); }
const bakeMW = () => {
  const s = new THREE.Scene(), c = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ uniforms: { uN: { value: BAND_N }, uE1: { value: E1 }, uE2: { value: E2 } }, depthTest: false, depthWrite: false, vertexShader: milkywayVert, fragmentShader: milkywayFrag }));
  const prev = renderer.getRenderTarget(); s.add(m); renderer.setRenderTarget(mwRT); renderer.render(s, c); renderer.setRenderTarget(prev);
  m.geometry.dispose(); m.material.dispose();
};
bakeMW(); renderer.domElement.addEventListener('webglcontextrestored', bakeMW);

/* ---------- the dome ---------- */
const skyGroup = new THREE.Group(); scene.add(skyGroup);
const skyUniforms = { ...pick('uZen', 'uMid', 'uHor', 'uHorW', 'uWarm', 'uPurple', 'uShadowC', 'uBeltC', 'uSunGlowC', 'uMoonGlowC', 'uSunDir', 'uMoonDir', 'uBright', 'uDusk', 'uInCloud', 'uMistTop', 'uMistBot', 'uTime', 'uDawn', 'uSunAmt', 'uSunC'), tMW: { value: mwRT.texture }, uMW: { value: 0.32 }, uSunUp: { value: 0 }, uMoonPh: { value: new THREE.Vector4(0, 1, 0, 0.03) }, uMoonC: { value: new THREE.Color(0.98, 0.96, 0.88) }, uHalo: { value: 0 }, uCorona: { value: 0 } };
const dome = new THREE.Mesh(new THREE.SphereGeometry(8000, 64, 32), new THREE.ShaderMaterial({ uniforms: skyUniforms, side: THREE.BackSide, depthWrite: false, vertexShader: skyVert, fragmentShader: skyFrag }));
dome.renderOrder = -2; dome.frustumCulled = false; skyGroup.add(dome);

let starsMat: THREE.ShaderMaterial;
/* ---------- stars: about 3000, by magnitude (each fainter magnitude about three times as many), white to blue-white
   mostly, some pale orange; they twinkle more near the horizon and fade as the sky brightens ---------- */
{
  const N = 3200, r = mulberry32(2026), pos = new Float32Array(N*3), mag = new Float32Array(N), col = new Float32Array(N*3);
  const TEMPS = [[1.0, 0.72, 0.43], [1.0, 0.83, 0.65], [1.0, 0.90, 0.82], [1.0, 0.98, 1.0], [0.92, 0.93, 1.0], [0.80, 0.85, 1.0]];
  for (let i = 0; i < N; i++){
    let d: THREE.Vector3;
    for (;;){
      if (r() < 0.45){   // crowded along the Milky Way
        const lon = r()*Math.PI*2, g = Math.sqrt(-2*Math.log(Math.max(1e-6, r())))*Math.cos(2*Math.PI*r()), b = g*0.12;
        d = E1.clone().multiplyScalar(Math.cos(lon)).addScaledVector(E2, Math.sin(lon)).multiplyScalar(Math.cos(b)).addScaledVector(BAND_N, Math.sin(b));
      } else { const u = r()*2 - 1, a = r()*Math.PI*2, s = Math.sqrt(1 - u*u); d = new THREE.Vector3(s*Math.cos(a), u, s*Math.sin(a)); }
      if (d.y > -0.02) break;
    }
    pos.set([d.x*7500, d.y*7500, d.z*7500], i*3);
    const m = 6.2 + Math.log10(Math.max(1e-4, r()))/0.477;   // magnitude, 6.2 the faintest
    mag[i] = Math.pow(10, -0.4*(m - 1.5));                      // brightness relative to a magnitude 1.5 star
    const t = TEMPS[Math.min(TEMPS.length - 1, Math.floor(Math.pow(r(), 0.8)*TEMPS.length))];
    col.set(t, i*3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aMag', new THREE.BufferAttribute(mag, 1)); g.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
  const stars = new THREE.Points(g, new THREE.ShaderMaterial({
    uniforms: { ...pick('uTime', 'uDusk', 'uInCloud', 'uPR'), uTwinkle: { value: 1 }, uStarK: { value: 1 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexShader: starsVert, fragmentShader: starsFrag,
  }));
  stars.frustumCulled = false; stars.renderOrder = -1; skyGroup.add(stars);
  starsMat = stars.material as THREE.ShaderMaterial;
}

/* ---------- per frame: the palette for where she is and how far the night has gone ---------- */
const DEG = Math.PI/180;
/** @param u her day; @param dawn 0 night … 1 the sun is up (main.ts) */
export function updateSky(u: number, dawn: number){
  skyGroup.position.copy(camera.position);
  const above = aboveAt(u);
  let p = weathered(lerpPal(TOWERS, ABOVE, above));
  // the twilight, by the sun's height: -18° night, -6° the blue hour, -2° the glow, +3.5° the sun is up
  const e = (-18 + 21.5*Math.pow(dawn, 0.75))*DEG;
  p = lerpPal(p, TW6, smooth(e, -15*DEG, -6*DEG));
  p = lerpPal(p, TW2, smooth(e, -6*DEG, -2*DEG));
  p = lerpPal(p, RISE, smooth(e, -2*DEG, 2*DEG));
  const set = (k: string, a: number[]) => (U as unknown as Record<string, { value: THREE.Color }>)[k].value.setRGB(a[0], a[1], a[2]);
  set('uZen', p.zen); set('uMid', p.mid); set('uHor', p.hor); set('uHorW', p.horW); set('uWarm', p.warm); set('uPurple', p.purple);
  set('uShadowC', p.shadow); set('uBeltC', p.belt); set('uSunGlowC', p.sunGlow);
  // the moon: where it stands, nearly abreast of her; its glow goes with how much of it is lit. In warmth it is 朧月, hazed, its glow
  // wide; on a clear night large and golden; in the cold small, white and dim behind the snow. A storm hides it
  { const t = tangentAt(u), a = aE + 0.7*(Math.atan2(t.z, t.x) - aE) - 0.44; U.uMoonDir.value.set(Math.cos(a)*Math.cos(eM), Math.sin(eM), Math.sin(a)*Math.cos(eM)); }
  const glow = (0.20 + 0.80*W.lit)*(1 + 0.1*W.warm + 0.9*W.clear)*(1 - 0.92*W.storm)*(1 - 0.30*W.cold);
  U.uMoonGlowC.value.setRGB(p.moonGlow[0]*glow, p.moonGlow[1]*glow, p.moonGlow[2]*glow);
  // (too fast to read a phase, it holds a gibbous moon rather than flicker through them)
  { const s = W.steady, x = 0.56 + (W.sinI - 0.56)*s, y = 0.83 + (W.cosI - 0.83)*s, l = Math.hypot(x, y) || 1; skyUniforms.uMoonPh.value.set(x/l, y/l, 0.8*W.warm + 0.8*W.storm + 0.6*W.cold, 0.030*(1 + 0.45*W.clear + 0.10*W.warm - 0.30*W.cold)); }
  // ice crystals in the cold air draw a halo round it; thin cloud in the warm years a corona; each as strong as the moon is bright
  { const lit = 0.72 + (W.lit - 0.72)*W.steady; skyUniforms.uHalo.value = W.cold*(1 - mistAt(u))*lit; skyUniforms.uCorona.value = W.warm*lit; }
  skyUniforms.uMoonC.value.setRGB(0.98 + 0.04*W.clear - 0.10*W.cold, 0.96 - 0.06*W.clear - 0.02*W.cold, 0.88 - 0.20*W.clear + 0.12*W.cold).multiplyScalar((1 - 0.15*W.warm)*(1 - 0.95*W.storm)*(1 + 0.25*W.cold));
  U.uSunDir.value.set(Math.cos(aE)*Math.cos(e), Math.sin(e), Math.sin(aE)*Math.cos(e));
  // The key is the moon's side all night (fixed: the GGXrd rule). In the last of the dawn it turns, slowly, to the sun's:
  // looking along the line the gates stand against the sunrise, and the fire of the bird is the brightest thing on them.
  U.uKey.value.copy(KEY_MOON).lerp(KEY_SUN, smooth(dawn, 0.72, 0.95)).normalize();
  U.uDusk.value = smooth(e, -16*DEG, -6*DEG);
  U.uSunAmt.value = smooth(e, -3.5*DEG, 2.5*DEG);
  U.uSunC.value.setRGB(1.0, 0.48 + 0.22*smooth(e, -2*DEG, 2.5*DEG), 0.34 + 0.16*smooth(e, -2*DEG, 2.5*DEG));
  U.uBright.value.copy(U.uMoonDir.value).lerp(U.uSunDir.value, U.uDusk.value);
  skyUniforms.uSunUp.value = smooth(e, -1.5*DEG, 1.0*DEG);
  // in the two lost years the sky is the mist
  U.uInCloud.value = mistAt(u);
  U.uMistTop.value.setRGB(MIST_TOP[0], MIST_TOP[1], MIST_TOP[2]); U.uMistBot.value.setRGB(MIST_BOT[0], MIST_BOT[1], MIST_BOT[2]);
  // the Milky Way fades under the moon's light and at dawn
  // (and the darker the moon, the more stars: a new moon's night is the clearest)
  const clear = (1 - 0.6*W.warm)*(1 + 1.6*W.clear)*(1 - 0.95*W.storm)*(1 - 0.85*W.cold);
  skyUniforms.uMW.value = 0.34*(1 - U.uDusk.value)*(1 - 0.35*above)*(1.3 - 0.7*W.lit)*clear;
  starsMat.uniforms.uStarK.value = (1.3 - 0.6*W.lit)*clear;
  starsMat.uniforms.uTwinkle.value = reduceMotion ? 0 : 1;
}
