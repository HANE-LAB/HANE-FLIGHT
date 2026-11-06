import { LAST_DAY, SPECIAL_DAYS } from './data';
import { smooth } from './dom';
import { S_END, sAt } from './path';
import { PAST, paceOf } from './climate';
import { beatOf } from './voices';

/* =====================================================================
   SEQUENCER — the pace of the nights, and how it ends
   Everything visible is a function of how far she has flown (seq.u, in days), so seeking is exact and any speed gives the same pictures.
   Only the pace changes. The days go by as the climate has them (src/climate.ts); and she eases down for the nights that matter, in metres of
   flight, not days, so that a big night in the snow, where the days fly by, takes as long as one in the storm. Two kinds, from what the room
   said (src/voices.ts): the nights the feeling stood out furthest, where she all but stops and the words can be read, and the rest of the
   big nights, where she only slows. It ends one of two ways: she comes to rest at today's gate, where the page opens, as Voyage's opens at
   today; or, in the film, she flies on past the last gate and up, into the sun.
   ===================================================================== */
export const seq = {
  u: 0,            // her position, in days
  simT: 0,         // the sim clock, seconds; only advances while playing
  cruise: 3,       // how fast the viewer has asked for: 3 is the usual pace
  playing: true,
  film: new URLSearchParams(location.search).has('film'),   // false she comes to rest at today, where the page opens; true the film: she flies on past the last gate, into the sun
};
/** The film: how far past the last gate she flies, in days of flight, before the picture holds. */
const FILM_END = LAST_DAY + 40;
/** Where she waits at today: just through today's gate. */
export const REST = LAST_DAY + 0.3;
export const endDay = () => seq.film ? FILM_END : REST;
/** 0 … 1: how far she has come to rest at today (never in the film): the lens draws away, the flock draws together. */
export const restAt = (u: number) => seq.film ? 0 : smooth(sAt(u), S_END - 200, S_END + 8);

/* ---------- the slow stretches: tabulated finely (8 to the day), since a stretch of 200 m can be two days or thirty ---------- */
const FINE = 8, N = (LAST_DAY + 64)*FINE;
const SLOW = new Float32Array(N).fill(1), GLIDE = new Float32Array(N);
/** Round each such gate: how much slower at the slowest, how many metres it takes to ease, and that she is slowest a little before the gate, with it in front of her. */
const STRETCH = [{ slow: 0.45, width: 55 }, { slow: 0.62, width: 66 }, { slow: 0.80, width: 88 }];
const LEAD = 14;
for (let d = 0; d <= LAST_DAY; d++){
  const b = beatOf(d), tier = b > 0 ? b : SPECIAL_DAYS.has(d) ? 0 : -1;
  if (tier < 0) continue;
  const { slow, width } = STRETCH[tier], s0 = sAt(d) - LEAD;
  // (from this gate outward both ways, until it no longer matters)
  for (const dir of [-1, 1]){
    for (let k = d*FINE + (dir > 0 ? 0 : -1); k >= 0 && k < N; k += dir){
      const x = (sAt(k/FINE) - s0)/width, g = Math.exp(-x*x);
      if (g < 0.004) break;
      SLOW[k] = Math.min(SLOW[k], 1 - slow*g);
      GLIDE[k] = Math.max(GLIDE[k], g);
    }
  }
}
const fine = (a: Float32Array, u: number) => { const x = Math.max(0, Math.min(N - 2, u*FINE)), k = Math.floor(x); return a[k] + (a[k + 1] - a[k])*(x - k); };
/** 0 … 1: how near a big night's gate she is (she glides through it). */
export const bigAt = (u: number) => fine(GLIDE, u);
const paceHere = (u: number) => u >= LAST_DAY ? PAST : paceOf(u);
function paceAt(u: number){
  // the last nights go slowly, and past the last gate she takes her time
  const last = 1 - 0.5*smooth(u, LAST_DAY - 6, LAST_DAY - 1);
  return Math.min(fine(SLOW, u), last);
}
/** Days a second at this day, at the usual pace. */
export const paceNow = (u: number) => paceHere(u)*paceAt(u);
(window as unknown as { __paceAt: (u: number) => number }).__paceAt = paceNow;

/* ---------- when the flight gets to a day, at the usual pace: seconds since the start. What must keep to the clock whatever the days are doing (the lightning) goes by this ---------- */
const CLOCK = (() => { const a = new Float32Array(N); let t = 0; for (let k = 1; k < N; k++){ const u = (k - 0.5)/FINE; t += 1/FINE/Math.max(1e-3, paceNow(u)); a[k] = t; } return a; })();
export const clockAt = (u: number) => fine(CLOCK, u);

export function seek(day: number){ seq.u = Math.max(0, Math.min(endDay(), day)); }
export function advance(dt: number){
  if (!seq.playing) return;
  seq.simT += dt;
  seq.u = Math.min(endDay(), seq.u + seq.cruise/3*paceNow(seq.u)*dt);
}
