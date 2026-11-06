import raw from '../data/writing.json';

/* =====================================================================
   VOICES — what the room said, night by night (data/writing.json, docs/DATA.md): how many spoke, how warm, how worried, how unhappy, which
   nights stand out from the nights round them. The climate, her pace, what is written on the posts, the words on the screen, the search
   by feeling and the sound all read it here. It needs nothing else, so src/climate.ts can stand on it.
   ===================================================================== */
export type Line = [string, number, number];   // what was said, how often it comes up on a post, its soul (below; 0 nothing much)
type Pair = [Line[], Line[]];                   // zh, ja
export type Stage = { from: number; name: string; front: Pair; back: Pair; neg?: Pair };
type Raw = { stages: Stage[]; moments: Record<string, Pick<Stage, 'front' | 'back' | 'neg'>>; nights: number[][]; said: Record<string, number[]> };
export const WRITTEN = raw as unknown as Raw;

/** The four souls of the old belief (一霊四魂), as the room's feelings: 和魂 worry and comfort, 幸魂 warmth and blessing, 荒魂 hurt and anger, 奇魂 the crowd coming from nowhere. */
export const SOUL = { nigi: 1, saki: 2, ara: 4, kushi: 8 } as const;

const R = { day: 0, kept: 1, people: 2, night: 3, gold: 4, kana: 5, hidden: 6, warm: 7, worry: 8, neg: 9, souls: 10, beat: 11, rain: 12 };
const BY_DAY = new Map(WRITTEN.nights.map(n => [n[R.day], n]));
const VOICE_LAST = WRITTEN.nights[WRITTEN.nights.length - 1][R.day];

export type Voice = { kept: boolean; people: number; night: number; gold: number; kana: number; hidden: number; warm: number; worry: number; neg: number };
/** A night's record, or null if the chat of that night is not known. warm, worry and neg are parts of 1. */
export function voiceOf(day: number): Voice | null {
  const n = BY_DAY.get(day);
  return n ? { kept: n[R.kept] === 1, people: n[R.people], night: n[R.night], gold: n[R.gold], kana: n[R.kana], hidden: n[R.hidden], warm: n[R.warm]/1000, worry: n[R.worry]/1000, neg: n[R.neg]/1000 } : null;
}
/** 0 an ordinary night, 1 she slows for it, 2 she all but stops. From how far the room's feeling stood out that night. */
export const beatOf = (day: number) => BY_DAY.get(day)?.[R.beat] ?? 0;
export const soulsOf = (day: number) => BY_DAY.get(day)?.[R.souls] ?? 0;
export const rainOf = (day: number) => (BY_DAY.get(day)?.[R.rain] ?? 0)/9;

const stageOf = (day: number) => { let s: Stage | null = null; for (const t of WRITTEN.stages) if (day >= t.from) s = t; return s; };
const FLAT = new Map<object, { text: string; ja: boolean; soul: number; hidden: boolean }[]>();
const flat = (s: Pick<Stage, 'front' | 'back' | 'neg'>) => {
  let f = FLAT.get(s);
  if (!f){
    f = [];
    for (const [pair, hidden] of [[s.front, false], [s.back, false], [s.neg, true]] as [Pair | undefined, boolean][]) if (pair) pair.forEach((l, k) => { for (const [text, , soul] of l) f!.push({ text, ja: k === 1, soul, hidden }); });
    FLAT.set(s, f);
  }
  return f;
};
export type Said = { text: string; ja: boolean; soul: number; hidden: boolean; people: number };
/** What that night really said, of the lines the author has read: what most people said first, then some of the longer things. */
export function saidOn(day: number): Said[] {
  const a = WRITTEN.said[String(day)], s = stageOf(day);
  if (!a || !s) return [];
  // (a night with lines of its own counts on past the stage's)
  const own = WRITTEN.moments[String(day)], f = own ? [...flat(s), ...flat(own)] : flat(s), out: Said[] = [];
  for (let i = 0; i + 1 < a.length; i += 2){ const l = f[a[i]]; if (l) out.push({ ...l, people: a[i + 1] }); }
  return out;
}

/** What shows only in the lightning, for that night: what was said that very night first, then the rest of its stretch, the longer things first. */
export function hiddenOn(day: number): Said[] {
  const s = stageOf(day);
  if (!s || !s.neg) return [];
  const own = WRITTEN.moments[String(day)], first = saidOn(day).filter(l => l.hidden), seen = new Set(first.map(l => l.text));
  const rest = [...(own ? flat(own) : []), ...flat(s)].filter(l => l.hidden && !seen.has(l.text) && (seen.add(l.text), true)).sort((a, b) => b.text.length - a.text.length);
  return [...first, ...rest.map(l => ({ ...l, people: 0 }))];
}

/** What a night of each feeling usually comes to, parts of 1: the middle of all the nights with a record. */
export const USUAL = (() => {
  const mid = (k: number) => { const a = WRITTEN.nights.filter(n => n[R.kept] === 1).map(n => n[k]).sort((x, y) => x - y); return a[a.length >> 1]/1000; };
  return { warm: mid(R.warm), worry: mid(R.worry), neg: mid(R.neg) };
})();

/* ---------- the same, as smooth curves over the days: for the climate, which must not jump from night to night ---------- */
const N = VOICE_LAST + 3;
const curve = (pick: (n: number[]) => number, sigma: number) => {
  const out = new Float32Array(N), kept = WRITTEN.nights.filter(n => n[R.kept] === 1), r = Math.ceil(sigma*3);
  const w = new Float32Array(N);
  for (const n of kept){
    const d = n[R.day], v = pick(n);
    for (let k = Math.max(0, d - r); k <= Math.min(N - 1, d + r); k++){ const g = Math.exp(-((k - d)**2)/(2*sigma*sigma)); out[k] += v*g; w[k] += g; }
  }
  // (where no night is near, as in the two lost years, it holds what it last knew)
  let last = 0; for (let k = 0; k < N; k++){ if (w[k] > 1e-3){ out[k] /= w[k]; last = out[k]; } else out[k] = last; }
  return out;
};
const at = (a: Float32Array, u: number) => { const x = Math.max(0, Math.min(N - 2, u)), k = Math.floor(x); return a[k] + (a[k + 1] - a[k])*(x - k); };
const PEOPLE = curve(n => Math.log(1 + n[R.people]), 6), WARM = curve(n => n[R.warm]/1000, 8), NEG = curve(n => n[R.neg]/1000, 2.5);
/** How many spoke about this day, smoothed: the log of it. */
export const crowdAt = (u: number) => at(PEOPLE, u);
export const warmthAt = (u: number) => at(WARM, u);
export const hurtAt = (u: number) => at(NEG, u);
