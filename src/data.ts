import raw from '../data/flight.json';
import { everyOf } from './climate';
import { beatOf, soulsOf } from './voices';

/* =====================================================================
   DATA — data/flight.json, built by `python -m flight update` (docs/DATA.md)
   ===================================================================== */
export type Night = {
  day: number;        // days since day0 (2021-02-03), Beijing time
  durH: number;       // hours streamed that night
  dm: number;         // danmaku that night
  title: string;      // her stream title, the 【B限】 prefix removed
  special: boolean;   // a big night: a taller gate with fire feathers, and she glides through it
};
type Raw = { day0: string; ndays: number; total: number[]; nights: (number | string)[][]; ghosts: number[]; gap: [number, number]; roster: Roster; meta: unknown };
/** Today's list without names or ids: how many days each has been with her (B站's 陪伴天数), longest first. vets: the 舰长 at a month or more. */
export type Roster = { sou: number[]; tei: number[]; vets: number[] };
const R = raw as Raw;

export const NDAYS = R.ndays;
export const NIGHTS: Night[] = R.nights.map(r => ({ day: r[0] as number, durH: r[2] as number, dm: r[3] as number, title: r[5] as string, special: r[6] === 1 }));
export const ROSTER = R.roster;
export const GHOSTS = R.ghosts;                 // nights known only from her notice posts: a gate in the mist, no numbers
export const GAP: [number, number] = R.gap;    // the longest hole in the stream archive: she is inside the cloud

/** A gate for the nights the climate gives one to (src/climate.ts): every big night, and of the others the night the chat was
 *  liveliest in each stretch, close together while it is warm, far apart in the cold. In day order. */
export type Slot = { day: number; night: Night | null };
export const SLOTS: Slot[] = (() => {
  const byDay = new Map(NIGHTS.map(n => [n.day, n]));
  const ghost = new Set(GHOSTS);
  const out: Slot[] = [];
  for (let d = 0; d < NDAYS; d++){
    if (byDay.has(d)) out.push({ day: d, night: byDay.get(d)! });
    else if (ghost.has(d)) out.push({ day: d, night: null });
  }
  const best = new Map<number, Slot>();
  for (const s of out){ const e = everyOf(s.day), k = e*Math.floor(s.day/e), b = best.get(k); if (!b || (s.night?.dm ?? -1) > (b.night?.dm ?? -1)) best.set(k, s); }
  const days = new Set<number>(), free = (d: number, gap: number) => { for (let k = d - gap + 1; k < d + gap; k++) if (days.has(k)) return false; return true; };
  // (every night the room's feeling stood out has a gate too: the search by feeling goes to them, and she slows for them)
  for (const s of out) if (s.night?.special || everyOf(s.day) === 1 || beatOf(s.day) > 0 || soulsOf(s.day) > 0) days.add(s.day);
  days.add(out[out.length - 1].day);
  for (const s of best.values()) if (free(s.day, Math.ceil(everyOf(s.day)*0.6))) days.add(s.day);
  return out.filter(s => days.has(s.day));
})();
export const NG = SLOTS.length;
/** The day of the last gate: the last night she streamed, which need not be the last day of the data. */
export const LAST_DAY = SLOTS[NG - 1].day;
/** The big nights: a taller gate with fire feathers, and she glides through. The ones the rules on her titles and numbers pick (flight/build.py), and the ones the room's feeling picks. */
export const SPECIAL_DAYS = new Set(NIGHTS.filter(n => n.special || beatOf(n.day) === 2).map(n => n.day));
/** How many were on board each day (大航海, the count Voyage collects): one small bird each. */
export const GUARDS = R.total;
export const guardsAt = (u: number) => { const k = Math.max(0, Math.min(NDAYS - 1, Math.floor(u))); return GUARDS[k]; };
/** The night the count jumped most (2026-10-12, +3647): the turn of the whole flight. The sunrise and the last act are set
 *  by it, not by the end of the data, which grows every day. */
export const JUMP = GUARDS.reduce((best, n, d) => d > 0 && n - GUARDS[d - 1] > GUARDS[best] - GUARDS[Math.max(0, best - 1)] ? d : best, 1);

const T0 = Date.UTC(2021, 1, 3);
export const dayOf = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return Math.round((Date.UTC(y, m - 1, d) - T0) / 86400000); };
export const fmtDate = (d: number) => { const t = new Date(T0 + Math.floor(d) * 86400000); return `${t.getUTCFullYear()}.${String(t.getUTCMonth() + 1).padStart(2, '0')}.${String(t.getUTCDate()).padStart(2, '0')}`; };
