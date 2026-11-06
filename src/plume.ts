import * as THREE from 'three';
import { fromDisplay } from './sky';

/* =====================================================================
   PLUME — 火羽, the fire feather that crowns HANE's warmest gates (HANE hinome/template.html, plumeSprite), drawn once
   into a texture for the bird and the feathers she sheds: the root at u = 0, the tip at u = 1, curling toward +v.
   A quill, an outer vane wider than the inner one, barbs swept toward the tip, three notches.
   Channels: r the feather (notches cut out), g its dark rim, b the quill, a the barbs and the light along the inner
   edge. The fire itself, vermilion at the root to pale gold at the tip, is laid on in the shader (FIRE), in scene
   values, so the tips glow through the bloom and the roots do not.
   ===================================================================== */
const L = 256, H = 96, N = 48;
const y0 = H*0.42, bend = H*0.22, u0 = 0.14, wOut = H*0.34, wIn = H*0.22;
const at = (u: number): [number, number] => [8 + (L - 18)*u, y0 + bend*u*u];   // the quill
const dir = (u: number) => { const dx = L - 18, dy = 2*bend*u, n = Math.hypot(dx, dy); return [dx/n, dy/n]; };
const prof = (u: number) => u <= u0 ? 0 : Math.pow(Math.max(0, Math.sin(Math.PI*Math.pow((u - u0)/(1 - u0), 0.7))), 0.8);
// side -1 the outer vane, +1 the inner; the edges lean toward the tip, like barbs
const edge = (u: number, side: number, k = 1): [number, number] => {
  const [x, y] = at(u), [tx, ty] = dir(u), f = prof(u)*(side < 0 ? wOut : wIn)*k;
  return [x - side*ty*f + tx*f*0.45, y + side*tx*f + ty*f*0.45];
};
type G = CanvasRenderingContext2D;
const outline = (g: G) => {
  g.beginPath(); g.moveTo(...at(u0));
  for (let i = 0; i <= N; i++) g.lineTo(...edge(u0 + (1 - u0)*i/N, -1));
  for (let i = N; i >= 0; i--) g.lineTo(...edge(u0 + (1 - u0)*i/N, 1));
  g.closePath();
};
const line = (g: G, side: number) => { g.beginPath(); for (let i = 0; i <= N; i++){ const p = edge(u0 + (1 - u0)*i/N, side); if (i) g.lineTo(...p); else g.moveTo(...p); } };
const notches = (g: G) => {
  g.save(); g.globalCompositeOperation = 'destination-out';
  for (const [u, s, k] of [[0.46, -1, 0.55], [0.68, -1, 0.45], [0.58, 1, 0.5]]){
    const a = edge(u - 0.012, s), b = edge(u + 0.012, s), inner = edge(u + 0.03, s, 1 - k);
    g.beginPath(); g.moveTo(...a); g.lineTo(...inner); g.lineTo(...b); g.closePath(); g.fill();
  }
  g.restore();
};
function layer(draw: (g: G) => void){
  const c = document.createElement('canvas'); c.width = L; c.height = H;
  const g = c.getContext('2d')!; g.fillStyle = g.strokeStyle = '#fff'; g.lineCap = 'round'; draw(g);
  return g.getImageData(0, 0, L, H).data;
}
function build(){
  const fill = layer(g => { outline(g); g.fill(); notches(g); });
  const rim = layer(g => { g.lineWidth = 2.6; outline(g); g.stroke(); notches(g); });
  const quill = layer(g => {
    for (let i = 0; i < 30; i++){   // thick and pale at the root
      const u1 = 0.94*i/30, u2 = 0.94*(i + 1)/30;
      g.globalAlpha = 0.95 - 0.35*u1; g.lineWidth = 4.6*(1 - u1) + 0.9;
      g.beginPath(); g.moveTo(...at(u1)); g.lineTo(...at(u2)); g.stroke();
    }
  });
  const barbs = layer(g => {
    g.save(); outline(g); g.clip();
    g.globalAlpha = 0.35; g.lineWidth = 1.1;
    for (let u = u0 + 0.015; u < 0.98; u += 0.022) for (const s of [-1, 1]){ g.beginPath(); g.moveTo(...at(u)); g.lineTo(...edge(Math.min(1, u + 0.03), s, 1.05)); g.stroke(); }
    g.restore();
    g.globalAlpha = 1; g.lineWidth = 1.8; line(g, 1); g.stroke();   // light along the inner edge
  });
  const data = new Uint8Array(L*H*4);
  for (let i = 0; i < L*H; i++){ data[i*4] = fill[i*4 + 3]; data[i*4 + 1] = rim[i*4 + 3]; data[i*4 + 2] = quill[i*4 + 3]; data[i*4 + 3] = barbs[i*4 + 3]; }
  const tex = new THREE.DataTexture(data, L, H, THREE.RGBAFormat);
  tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}
export const plumeTex = build();
/** Length over width of the feather card (the texture's aspect). */
export const PLUME_ASPECT = L/H;
// HANE's fire, root to tip, as display colours; brought back through the tone curve (the gold tips held a little under
// white so they glow without burning out)
export const FIRE = [['#7e1d10', 0], ['#b8301b', 0.18], ['#e2582a', 0.45], ['#f39a3e', 0.7], ['#f9cf78', 0.88], ['#ffe9c4', 1]]
  .map(([hex]) => new THREE.Vector3(...fromDisplay(hex as string)));
export const FIRE_AT = [0, 0.18, 0.45, 0.7, 0.88, 1];
const scene = (hex: string) => new THREE.Vector3(...fromDisplay(hex));
/** Her face (chunks/face.glsl), from her portraits: skin, blush, lash, iris dark, middle and light, pupil, white of the eye, fine lines, glints, the warm of her chin. The skin is held under the bloom's threshold, or the whole face goes to a white disc. */
export const FACE_COLORS = ['#d6baa2', '#d87468', '#21100e', '#6a1f0c', '#e96a1a', '#ffd26c', '#180806', '#fbf3ea', '#a9604e', '#a8ccd6', '#d8925a'].map(scene);
/** What she wears, by art/bird/build.py's OK_*: the first knot (2021), gold, red, petal, the flower's heart. And the knot of 2022, pale gold. */
export const ORN_COLORS = ['#e0342a', '#d9a640', '#e0342a', '#ea3f2e', '#c9963a'].map(scene);
export const KNOT_2022 = scene('#d4aa6a');
/** The colour of her hair, root to tip: long and pale in 2021 and 2022, a coppery bob going to coral from 2023. */
export const HAIR = [[scene('#dfb39c'), scene('#f88a78')], [scene('#e8b9a2'), scene('#f59e8a')], [scene('#bc6240'), scene('#f0583c')]];
/** The fires of the higher ranks, root to tip. 提督: blossom pink, as the petals that fall through all of this and the sky behind them: close enough to fire to fly with it, far enough to pick out. */
export const ROSE = ['#8a2038', '#ec6a84', '#ffd4d0'].map(scene);
/** The 总督, each a gold of its own, in the order they came: red gold, yellow gold, white gold, rose gold, green gold, amber, platinum, bronze. How many there are is the day's data: see goldOf. */
export const GOLDS = [['#94340c', '#e8862a', '#fbd488'], ['#94500c', '#e6a32c', '#fbe29a'], ['#a0703c', '#e2c488', '#f6e8c4'], ['#8a3c30', '#e8946e', '#fcdcc8'], ['#6e6414', '#d8c850', '#fff6b8'], ['#8c3006', '#f49414', '#ffcc58'], ['#70707c', '#dcdce4', '#ffffff'], ['#5a2c10', '#ba7434', '#ecbc7c']].map(r => r.map(scene));
/** The gold of the k-th 总督: past the eighth, half way between two of them, a different pair each time, so however many come no two are the same. */
export const goldOf = (k: number) => {
  const n = GOLDS.length, a = GOLDS[k%n];
  if (k < n) return a;
  const round = Math.floor(k/n), b = GOLDS[(k + round*3)%n], m = 0.5 - 0.5/(round + 1);
  return a.map((c, i) => c.clone().lerp(b[i], m + 0.25));
};
/** What the marks in wake.*.glsl take, by rank: a star (the yellow gold), a 提督, then each of the n 总督. */
export const tintsOf = (n: number) => [GOLDS[1][1], ROSE[1], ...Array.from({ length: n }, (_, k) => goldOf(k)[1])];
