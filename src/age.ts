import { GHOSTS, GUARDS, JUMP, NDAYS, NIGHTS, dayOf } from './data';
import { smooth } from './dom';

/* =====================================================================
   AGE — she does not stay the bird she is today. Two clocks, both of them her own numbers, and in the long night they run opposite ways:
   the years with the fewest people are the years she streamed the most (358, 359, 335 nights, with 13 to 72 people on board).
   Age only goes one way. In her first year she grows up, from a hatchling to a grown bird. And the tail is her rings: a pair comes in on each
   anniversary and grows by the nights she streams from then on and by nothing else, never shorter, as the long-tailed fowl's never moults.
   The fire goes with the people: how far below her highest count she is now. When they have gone it sinks to embers, every feather
   still there; when they come back it burns again. So the tail grows fastest while the fire is lowest.
   All of it a function of the day, so seeking is exact, and every day's new data makes the tail a little longer.
   ===================================================================== */
const NIGHTS_BY = new Float32Array(NDAYS + 1), PEAK = new Float32Array(NDAYS);
{
  // (a night she streamed: in the archive, or known only from her notice of it)
  const on = new Set([...NIGHTS.map(n => n.day), ...GHOSTS]);
  let c = 0, top = 1;
  for (let d = 0; d < NDAYS; d++){ if (on.has(d)) c++; NIGHTS_BY[d] = c; top = Math.max(top, GUARDS[d]); PEAK[d] = top; }
  NIGHTS_BY[NDAYS] = c;
}
const inData = (u: number) => Math.max(0, Math.min(NDAYS - 1, u));
/** How many nights she has streamed by this day. */
const nightsBy = (u: number) => { const a = inData(u), k = Math.floor(a); return NIGHTS_BY[k] + (NIGHTS_BY[k + 1] - NIGHTS_BY[k])*(a - k); };

/** The two days she changed her look, as in Voyage: the new outfits were shown in streams on these days. She moults, and comes out of it with more of a crest and a mane. */
const ERAS = [dayOf('2022-02-14'), dayOf('2023-02-14')];
// over how many days either side: the days go by much faster at the second, and it should take about a second all the same
const MOULT = [2.5, 6];
/** 0 hatchling … 1 grown, by the first change of look. */
export const grownAt = (u: number) => Math.pow(Math.min(1, Math.max(0, u)/ERAS[0]), 0.7);
/** How big she is against the bird she will be. */
export const sizeAt = (u: number) => 0.55 + 0.45*grownAt(u);
/** How far each of the two moults has gone, 0 … 1. */
export const moultAt = (u: number) => ERAS.map((e, i) => smooth(u, e - MOULT[i], e + MOULT[i]));
/** A front of light passes along her as she moults: where it is, along her own length, and how strong. */
export function moultFront(u: number, out: { at: number; on: number }){
  out.on = 0;
  ERAS.forEach((e, i) => {
    const k = (u - (e - MOULT[i]))/(2*MOULT[i]);
    if (k > 0 && k < 1){ out.at = -1.6 + 2.45*k; out.on = Math.sin(Math.PI*k); }
  });
}

/** The day each pair of tail feathers comes in: i years after she began, on the day she began. */
const pairBorn = (i: number) => dayOf(`${2021 + i}-02-03`);
/** How long a tail feather is, in her own units, that has seen n nights: it grows less as it gets long. */
const tailLength = (n: number) => 5*(1 - Math.exp(-n/2700));
/** How long the tail feathers of pair i are on this day. */
export const pairLength = (i: number, u: number) => {
  const from = pairBorn(i);
  return u < from ? 0 : tailLength(nightsBy(u) - (from > 0 ? nightsBy(from - 1) : 0));
};

/** 0 … 1: how far the fire has sunk, by how far below her highest count the people on board are now. @param n how many are flying now */
export const emberAt = (u: number, n: number) => smooth(Math.log10(PEAK[Math.floor(inData(u))]) - Math.log10(Math.max(n, 1)), 0.25, 1.35);
/** 0 … 1: the fire taking again, the night the count jumps. */
export const flareAt = (u: number) => smooth(u, JUMP - 1.6, JUMP + 0.6)*(1 - smooth(u, JUMP + 2.5, JUMP + 11));
