import { mulberry32 } from './dom';

/* =====================================================================
   LIGHTNING — the shape of a bolt by the dielectric breakdown model (Niemeyer, Pietronero & Wiesmann 1984; Kim & Lin 2004), a
   stochastic model of how a discharge branches: the channel grows a cell at a time, the likelier where the electric potential is higher,
   P = φ^η / Σφ^η. The potential is not solved on a grid. It is written in closed form after Yun et al., φ = P/(N·B), from the
   distances to the ground (P), the channel so far (N) and the walls (B), each a sum of (1/r)^ρ.
   The order the cells joined in is the stepped leader's own progress; the path that reached the ground is the main channel, which
   the return stroke lights. Seeded by the strike's number: a seek finds the same bolt.
   A bolt takes some thousands of operations per cell, so it grows a little each frame, ahead of its strike (src/weather.ts).
   ===================================================================== */
const W = 56, H = 84, RHO = 1.1, ETA = 2.6, MAX = 620;
// (1/r)^ρ for each offset between two cells
const FAR = new Float32Array((W + 1)*(H + 1));
for (let y = 0; y <= H; y++) for (let x = 0; x <= W; x++) FAR[y*(W + 1) + x] = 1/Math.max(1, Math.pow(x*x + y*y, RHO/2));
const far = (dx: number, dy: number) => FAR[Math.abs(dy)*(W + 1) + Math.abs(dx)];
const POW = new Float32Array(Math.max(W, H) + 2);
for (let i = 1; i < POW.length; i++) POW[i] = Math.pow(i, -RHO);

/** A bolt, as cells in grid units (x 0 … W from left to right, y 0 at the cloud … H at the floor). */
export type Bolt = { x: Float32Array; y: Float32Array; parent: Int32Array; order: Float32Array; bright: Float32Array; wide: Float32Array; n: number };
export const BOLT_W = W, BOLT_H = H;

export class BoltGrowth {
  bolt: Bolt | null = null;
  private r: () => number; private tx: number;
  private cellOf = new Int32Array(W*H).fill(-1);
  private cx: number[] = []; private cy: number[] = []; private par: number[] = [];
  // the candidates: the free cells next to the channel, with the sum N of (1/r)^ρ to the channel
  private qx: number[] = []; private qy: number[] = []; private qp: number[] = []; private qn: number[] = []; private w: number[] = [];
  private reached = -1;
  constructor(seed: number){
    this.r = mulberry32(seed);
    this.tx = Math.round(W*(0.25 + 0.5*this.r()));   // where it is heading for, on the floor
    this.join(Math.floor(W/2 + (this.r() - 0.5)*6), 0, -1);
  }
  private join(x: number, y: number, p: number){
    const { cx, cy, par, qx, qy, qp, qn, cellOf } = this, me = cx.length;
    cx.push(x); cy.push(y); par.push(p);
    cellOf[y*W + x] = -2;
    for (let i = 0; i < qx.length; i++) qn[i] += far(qx[i] - x, qy[i] - y);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++){
      const a = x + dx, b = y + dy;
      if (a < 0 || b < 0 || a >= W || b >= H || cellOf[b*W + a] !== -1) continue;
      let n = 0;
      for (let k = 0; k <= me; k++) n += far(a - cx[k], b - cy[k]);
      cellOf[b*W + a] = qx.length; qx.push(a); qy.push(b); qp.push(me); qn.push(n);
    }
  }
  /** Grow by up to this many cells. */
  step(cells: number){
    const { cx, qx, qy, qp, qn, w, cellOf, tx } = this;
    for (let c = 0; c < cells && !this.bolt; c++){
      if (this.reached >= 0 || cx.length >= MAX){ this.finish(); break; }
      let sum = 0;
      for (let i = 0; i < qx.length; i++){
        const x = qx[i], y = qy[i];
        const P = far(x - tx, H - y) + POW[H - y], B = POW[x + 1] + POW[W - x] + POW[y + 1];
        sum += Math.pow(P/(qn[i]*B), ETA); w[i] = sum;
      }
      const t = this.r()*sum;
      let lo = 0, hi = qx.length - 1;
      while (lo < hi){ const m = (lo + hi) >> 1; if (w[m] < t) lo = m + 1; else hi = m; }
      const x = qx[lo], y = qy[lo], p = qp[lo], last = qx.length - 1;
      // (out of the candidates, the last one taking its place)
      qx[lo] = qx[last]; qy[lo] = qy[last]; qp[lo] = qp[last]; qn[lo] = qn[last]; cellOf[qy[lo]*W + qx[lo]] = lo;
      qx.pop(); qy.pop(); qp.pop(); qn.pop();
      this.join(x, y, p);
      if (y === H - 1) this.reached = cx.length - 1;
    }
    return this.bolt;
  }
  /** All of it at once: a seek landed on this strike. */
  now(){ while (!this.bolt) this.step(64); return this.bolt; }
  private finish(){
    // the path that reached the floor is the main channel; of the rest keep what has some length, dimmer and thinner away from it
    const { cx, cy, par, r } = this, n = cx.length, end = this.reached >= 0 ? this.reached : n - 1;
    const main = new Uint8Array(n), below = new Int32Array(n), from = new Int32Array(n);
    for (let i = end; i >= 0; i = par[i]) main[i] = 1;
    for (let i = n - 1; i > 0; i--) below[par[i]] = Math.max(below[par[i]], below[i] + 1);
    for (let i = 1; i < n; i++) from[i] = main[i] ? 0 : from[par[i]] + 1;
    const keep = new Int32Array(n).fill(-1);
    let m = 0;
    for (let i = 0; i < n; i++) if (main[i] || from[i] + below[i] >= 9) keep[i] = m++;
    const b: Bolt = { x: new Float32Array(m), y: new Float32Array(m), parent: new Int32Array(m), order: new Float32Array(m), bright: new Float32Array(m), wide: new Float32Array(m), n: m };
    for (let i = 0; i < n; i++){
      const k = keep[i];
      if (k < 0) continue;
      b.x[k] = cx[i] + 0.8*(r() - 0.5); b.y[k] = cy[i] + 0.8*(r() - 0.5);
      b.parent[k] = i === 0 ? -1 : keep[par[i]]; b.order[k] = i/n;
      b.bright[k] = main[i] ? 1 : 0.62*Math.exp(-from[i]/16);
      b.wide[k] = main[i] ? 1 : Math.max(0.28, 0.5*Math.exp(-from[i]/30));
    }
    this.bolt = b;
  }
}
