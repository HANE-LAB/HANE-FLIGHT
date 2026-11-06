import { WRITTEN, beatOf, crowdAt, hurtAt, rainOf, soulsOf, warmthAt, SOUL } from './voices';

/* =====================================================================
   CLIMATE — the weather of the flight is not the calendar's. It is how those years went for her, read from what the room said (the emotion
   analysis, docs/DATA.md): a storm is the room turning on her, warmth is people warming to her, cold is being left alone. The stretches
   below start where the analysis found the room changed, and on top of them each night's own feeling comes through: rain on the nights the
   room was worried or hurt, warmth and petals on the nights it was warm, even in the snow. The pace she flies and how many nights get a gate
   go with it. Everything here is a function of the day.
   ===================================================================== */
const T0 = Date.UTC(2021, 1, 3);
const day = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return Math.round((Date.UTC(y, m - 1, d) - T0)/86400000); };

export type Mood = 'sprout' | 'warm' | 'clear' | 'storm' | 'cold' | 'thaw' | 'dawn' | 'sunlit';
/** from: the day it begins. pace: days a second. every: a gate every so many days. fade: over how many days either side it comes on. amount: how much of that weather. */
export const PHASES: { mood: Mood; from: number; pace: number; every: number; fade: number; amount?: number }[] = [
  { mood: 'sprout', from: 0, pace: 7, every: 4, fade: 1 },
  // the room warms from the first nights on record; warmth halves on 2022-03-01, and from then on it is a slow ebb (below: clearAt)
  { mood: 'warm', from: day('2021-10-01'), pace: 3, every: 2, fade: 24 },
  { mood: 'clear', from: day('2022-03-01'), pace: 4, every: 3, fade: 22 },
  // the fierce weeks run to 2022-11-07; after that the anger has gone from the chat and only rain is left, into the new year
  { mood: 'storm', from: day('2022-10-12'), pace: 1.4, every: 1, fade: 5 },
  { mood: 'storm', from: day('2022-11-08'), pace: 3, every: 2, fade: 6, amount: 0.55 },
  // cold, not hostile: the feeling is no worse than usual, there are only fewer and fewer. Nothing is known of the two lost years, so they go by quickest
  { mood: 'cold', from: day('2023-01-01'), pace: 9, every: 9, fade: 18 },
  { mood: 'cold', from: day('2023-09-01'), pace: 18, every: 18, fade: 20 },
  { mood: 'cold', from: day('2025-07-26'), pace: 11, every: 11, fade: 20 },
  // a false spring: the room comes back from 04-13, to 165 people on 04-24, and by June it has gone again. The snow comes back, thinner
  { mood: 'thaw', from: day('2026-04-13'), pace: 3, every: 2, fade: 7 },
  { mood: 'cold', from: day('2026-06-01'), pace: 7, every: 5, fade: 14, amount: 0.5 },
  // the quietest stretch of all: thirty people a night, half of them old hands
  { mood: 'cold', from: day('2026-09-01'), pace: 5, every: 5, fade: 10, amount: 0.7 },
  // and in six nights 43 become 15970. The light comes with them, not before (season.ts dawnAt)
  { mood: 'dawn', from: day('2026-10-06'), pace: 1, every: 1, fade: 1.5 },
  // the sun is up and stays up: the days go by quicker again, or the film would grow by a third of a second every day. Warm, in the air
  { mood: 'sunlit', from: day('2026-11-12'), pace: 14, every: 7, fade: 10 },
];
/** Her flying speed, metres a second, whatever the days are doing. She slows for the nights that matter (src/sequencer.ts). */
const SPEED = 75;
const sm = (x: number, a: number, b: number) => { const t = Math.max(0, Math.min(1, (x - a)/(b - a))); return t*t*(3 - 2*t); };

/** How far each phase holds at this day, 0 … 1, adding up to 1. */
const weights = (u: number) => {
  const out = new Array(PHASES.length).fill(0) as number[];
  let left = 1;
  for (let i = PHASES.length - 1; i > 0; i--){
    const w = left*sm(u, PHASES[i].from - PHASES[i].fade, PHASES[i].from + PHASES[i].fade);
    out[i] = w; left -= w;
  }
  out[0] = left;
  return out;
};
/** Days a second at her cruising speed, before the slowing for a big night or the end. */
export const paceOf = (u: number) => { const w = weights(u); let l = 0; PHASES.forEach((p, i) => { l += w[i]*Math.log(p.pace); }); return Math.exp(l); };
/** Days a second past the last gate, where there are no more days to tell: whatever the climate is by then, the ending takes as long. */
export const PAST = SPEED/30;
/** Metres of flight a day here: the days go by faster or slower, she does not. */
export const metresOf = (u: number, past = false) => SPEED/(past ? PAST : paceOf(u));

/* ---------- each night's own weather, on top of the stretches. Pure functions of the day, tabulated once. A night's weather lasts long
   enough to be seen however fast the days are going there: about a second of flight either side ---------- */
const LAST = WRITTEN.nights[WRITTEN.nights.length - 1][0] + 40;
const bumps = (of: (d: number) => number) => {
  const a = new Float32Array(LAST + 2);
  for (const n of WRITTEN.nights){
    const d = n[0], v = of(d);
    if (v <= 0) continue;
    const w = Math.max(0.9, 0.85*paceOf(d)), r = Math.ceil(w*2.5);
    for (let k = Math.max(0, d - r); k <= Math.min(LAST + 1, d + r); k++) a[k] = Math.max(a[k], v*Math.exp(-(((k - d)/w)**2)));
  }
  return a;
};
const read = (a: Float32Array, u: number) => { const x = Math.max(0, Math.min(LAST, u)), k = Math.floor(x); return a[k] + (a[k + 1] - a[k])*(x - k); };
// (a night counts as warm when it is well above its neighbours: the same nights as the 幸魂)
const RAIN = bumps(rainOf), WARM_NIGHT = bumps(d => soulsOf(d) & SOUL.saki ? 0.55 + 0.225*beatOf(d) : 0);
/** Rain on a night the room was worried or hurt, 0 … 1, whatever the stretch: 2022-03-30, when more than a quarter of what was said was worry, rains as hard as the storm. */
export const rainNightAt = (u: number) => read(RAIN, u);
/** A warm night, 0 … 1: petals and rose, even in the snow (2023-01-21, 2026-02-16). */
const warmNightAt = (u: number) => read(WARM_NIGHT, u);
/** The clear stretch cools as the room ebbs: 1476 people a night in March 2022, 588 by September. */
const clearAt = (u: number) => 0.32 + 0.68*sm(crowdAt(u), Math.log(600), Math.log(1400));
/** How warm the warm stretch is, by how warm the room was. */
const warmAt = (u: number) => 0.62 + 0.38*sm(warmthAt(u), 0.08, 0.135);
/** How much lightning, 0 … 1: only in the fierce weeks, and most on the nights the room was most hurt. */
export const thunderAt = (u: number) => sm(u, day('2022-10-11'), day('2022-10-13'))*(1 - sm(u, day('2022-11-05'), day('2022-11-09')))*(0.55 + 0.45*sm(hurtAt(u), 0.008, 0.022));

export const moodsAt = (u: number) => {
  const w = weights(u), o = { sprout: 0, warm: 0, clear: 0, storm: 0, cold: 0, thaw: 0, dawn: 0, sunlit: 0 } as Record<Mood, number>;
  PHASES.forEach((p, i) => { o[p.mood] += w[i]*(p.amount ?? 1); });
  const rain = rainNightAt(u), warm = warmNightAt(u);
  o.warm = Math.min(1, o.warm*warmAt(u) + 0.85*warm);
  o.clear *= clearAt(u)*(1 - 0.6*warm);
  o.cold *= 1 - 0.7*warm;
  o.storm = Math.min(1, o.storm + 0.42*rain);
  return o;
};

/** How warm the air is once the sun is up: what is in it, not the colour of the sky. It comes on after the surge. */
export const airOf = (u: number) => sm(u, day('2026-10-14'), day('2026-10-30'));
/** How far the frost has grown on the lens: it creeps in through the long cold, goes in the false spring, creeps back when that fails, and the real dawn takes it. */
export const frostOf = (u: number) => (0.70*sm(u, day('2023-01-20'), day('2023-08-01')) + 0.28*sm(u, day('2023-08-01'), day('2024-07-01')))*(1 - 0.92*sm(u, day('2026-04-13'), day('2026-05-05')) + 0.62*sm(u, day('2026-06-01'), day('2026-09-10')) - 0.70*sm(u, day('2026-10-05'), day('2026-10-09')));
/** A gate every so many days, on this day; while the pace is still coming down into a denser phase, never more than three gates a second. */
export const everyOf = (d: number) => { let e = PHASES[0].every; for (const p of PHASES) if (d >= p.from) e = p.every; return Math.max(e, Math.ceil(paceOf(d)/3 - 1e-9)); };
