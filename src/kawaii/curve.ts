/** A scale over a bone's place along its chain: 0 at the chain's root, 1 at its farthest tip.
 *  KawaiiPhysics keys an FRichCurve the same way (LengthRateFromRoot); here the keys are [rate, scale]
 *  pairs, sorted, linear between them and held flat past the ends. No keys means 1 everywhere. */
export type Curve = readonly (readonly [number, number])[];

export function evalCurve(c: Curve | undefined, t: number): number {
  if (!c || c.length === 0) return 1;
  if (t <= c[0][0]) return c[0][1];
  for (let i = 1; i < c.length; i++) {
    const [t1, v1] = c[i];
    if (t > t1) continue;
    const [t0, v0] = c[i - 1];
    return t1 > t0 ? v0 + (v1 - v0) * (t - t0) / (t1 - t0) : v1;
  }
  return c[c.length - 1][1];
}
