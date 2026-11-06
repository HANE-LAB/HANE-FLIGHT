import * as THREE from 'three';
import raw from '../data/writing.json';
import { NIGHTS, SLOTS } from './data';
import { mulberry32 } from './dom';
import { HAND } from './fonts';
import { SMALL } from './down';

/* =====================================================================
   WRITING — one person, one line, written up the posts of her gates, as Fushimi's posts carry who gave them. People who spoke that
   night on the face she flies at, those who said good night on the back. In flight only how much can be seen: a few columns in
   the cold, every post full after the sunrise. Stopped and close to, it can be read. What it says is what that stage of the years
   really said (data/writing.json, docs/DATA.md): turning Japanese through the cold; gold for those who had been there a year or
   more, so it is goldest when fewest are left. In the storm the room's anger is written in the open, cold, and far more of it than its true share: that is what those weeks were (docs/DATA.md); the lightning makes it flare. The nights that
   stand out mostly carry what was said that very night.
   Two tables, drawn once at load: an atlas of every character in the page's own hand (src/fonts.ts), one channel; and the cells, every written
   column of every gate, which character each cell holds and what it is. torii.frag.glsl reads them. ?writing=0 turns all this off.
   ===================================================================== */
export const WRITING = new URLSearchParams(location.search).get('writing') !== '0';

/** Where the writing runs up a post, in shape units, and the post's mean radius: keep the same in torii.frag.glsl. */
const SPAN = 0.54, RADIUS = 0.0395;
/** A character's height, and the distance from one column to the next round the post, metres. Gates of any height use the same hand. */
const CELL = 0.15, PITCH = 0.18;

type Lines = [string, number][];   // what was said, and how often it comes up (more for what more people said)
type Faces<P> = { front: P; back: P; neg?: P };
type Stages<P> = ({ from: number } & Faces<P>)[];
const D = raw as unknown as { stages: Stages<[Lines, Lines]>; moments: Record<string, Faces<[Lines, Lines]>>; nights: number[][] };   // each night: day, 1 if its lines were kept or 0 if only its numbers, people, said good night, part in gold, part in kana, part only in the lightning
/** A pack of a stage's lines, each as many times as it comes up: dealt to the end before it is dealt again, so that what few people said still gets said. */
class Deck {
  readonly list: string[]; private order: Uint32Array; private at = 0;
  constructor(l: Lines){ this.list = l.flatMap(([t, w]) => new Array<string>(w).fill(t)); this.order = Uint32Array.from(this.list, (_, i) => i); }
  get size(){ return this.list.length; }
  deal(r: () => number){
    if (this.at >= this.list.length) this.at = 0;
    const k = this.at + Math.floor(r()*(this.list.length - this.at)), o = this.order, v = o[k];
    o[k] = o[this.at]; o[this.at++] = v;
    return this.list[v];
  }
}
type Pool = [Deck, Deck];   // zh, ja
const bag = (p: [Lines, Lines]) => [new Deck(p[0]), new Deck(p[1])] as Pool;
const faces = (s: Faces<[Lines, Lines]>): Faces<Pool> => ({ front: bag(s.front), back: bag(s.back), neg: s.neg && bag(s.neg) });
const STAGES: Stages<Pool> = D.stages.map(s => ({ from: s.from, ...faces(s) }));
const MOMENTS = new Map(Object.entries(D.moments).map(([d, s]) => [Number(d), faces(s)]));
/** On the nights that stand out, how much of the post is what was said that very night; the rest is the stage's. */
const OWN_NIGHT = 0.9;

/* ---------- the atlas ---------- */
const TILE = 64, GX = 32;
const SERIF = '"Yu Mincho","Noto Serif CJK SC","Source Han Serif SC","Songti SC","SimSun"';
const seen = new Set<string>();
for (const s of [...STAGES, ...MOMENTS.values()]) for (const p of [s.front, s.back, s.neg]) if (p) for (const k of p) for (const t of k.list) for (const c of t) seen.add(c);
const CHARS = [...seen].filter(c => c !== ' ');
const GLYPH = new Map(CHARS.map((c, i) => [c, i + 1]));   // (0 is an empty cell)
export const INK_GX = GX, INK_GY = Math.ceil((CHARS.length + 1)/GX);
let inkMean = 0.2, atlasMs = 0;
export const inkTex = WRITING ? (() => {
  const t0 = performance.now();
  const canvas = document.createElement('canvas'); canvas.width = TILE*INK_GX; canvas.height = TILE*INK_GY;
  const x = canvas.getContext('2d', { willReadFrequently: true })!;
  x.fillStyle = '#000'; x.fillRect(0, 0, canvas.width, canvas.height);
  x.fillStyle = x.strokeStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
  const px = TILE*0.90;
  // Written down the post: a canvas has no vertical text, so what vertical setting does by hand. The small kana and the comma go to
  // the upper right of the cell, the long vowel mark turns to run along the column; digits and letters stand upright, full width.
  CHARS.forEach((c, i) => {
    const g = i + 1, cx = (g%GX + 0.5)*TILE, cy = (Math.floor(g/GX) + 0.5)*TILE;
    let t = c;
    if (/[0-9]/.test(c)) t = String.fromCharCode(c.charCodeAt(0) + 0xFEE0);
    if (/[a-z]/.test(c)) t = String.fromCharCode(c.charCodeAt(0) + 0xFEE0);
    if (c === ',') t = '，';
    if (c === '!') t = '！';
    if (c === '?') t = '？';
    x.font = `700 ${px}px ${HAND},${SERIF},serif`; x.lineWidth = px*0.018;
    x.save(); x.translate(cx, cy);
    if (SMALL.includes(c)) x.translate(px*0.13, -px*0.20);
    if (c === '、' || c === ',') x.translate(px*0.58, -px*0.58);
    if (c === 'ー') x.rotate(Math.PI/2);
    x.fillText(t, 0, 0); x.strokeText(t, 0, 0);
    x.restore();
  });
  const d = x.getImageData(0, 0, canvas.width, canvas.height).data, r = new Uint8Array(canvas.width*canvas.height);
  let sum = 0;
  for (let i = 0; i < r.length; i++){ r[i] = d[i*4]; sum += r[i]; }
  inkMean = sum/255/(TILE*TILE*CHARS.length);
  const t = new THREE.DataTexture(r, canvas.width, canvas.height, THREE.RedFormat, THREE.UnsignedByteType);
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true; t.anisotropy = 4; t.needsUpdate = true;
  atlasMs = performance.now() - t0;
  return t;
})() : null;
/** How much of a character's tile is ink, on average: what the writing comes to from far off. */
export const inkAverage = () => inkMean;

/* ---------- the cells ---------- */
const NIGHT = new Map(D.nights.map(n => [n[0], n]));
const stageOf = (day: number) => { let s: Stages<Pool>[number] | null = null; for (const t of STAGES) if (day >= t.from) s = t; return s; };
/** A night newer than the table, which is made by hand from the chat: the last fortnight's shape, scaled by how much chat it had. */
const LAST = D.nights[D.nights.length - 1][0];
const guess = (() => {
  const dm = new Map(NIGHTS.map(n => [n.day, n.dm])), recent = D.nights.slice(-14).filter(n => n[1] === 1 && dm.get(n[0]));
  const sum = (f: (n: number[]) => number) => recent.reduce((a, n) => a + f(n), 0), people = sum(n => n[2]), chat = sum(n => dm.get(n[0])!);
  return (day: number, chatThatNight: number) => { const p = Math.round(chatThatNight*people/chat); return [day, 1, p, Math.round(p*sum(n => n[3])/people), sum(n => n[4])/recent.length, sum(n => n[5])/recent.length, 0]; };
})();
const encoded = new Map<string, number[]>();
const enc = (t: string) => { let e = encoded.get(t); if (!e){ e = [...t].map(c => GLYPH.get(c) ?? 0); encoded.set(t, e); } return e; };
export const CELLS_WIDTH = 2048;
let cells = new Uint16Array(1 << 21), used = 0;
const room = (n: number) => { if (used + n > cells.length){ const b = new Uint16Array(Math.max(cells.length*2, used + n)); b.set(cells); cells = b; } };

/** Lay out one face of one gate: each line goes to one post then the other, down a column, and on to the next column. */
function writeFace(stage: Stages<Pool>[number], own: Faces<Pool> | undefined, side: 'front' | 'back', lines: number, gold: number, kana: number, hidden: number, C: number, R: number, seed: number){
  const grid = new Uint16Array(2*C*R), col = [0, 0], row = [0, 0], r = mulberry32(seed);
  for (let i = 0; i < lines; i++){
    const p = i & 1;
    if (col[p] >= C){ if (col[1 - p] >= C) break; continue; }
    const bad = !!stage.neg && r() < hidden, ja = r() < kana ? 1 : 0;
    const take = (p?: Pool) => p && (p[ja].size ? p[ja] : null), mine = own && r() < OWN_NIGHT;
    const deck = take(mine ? (bad ? own.neg : own[side]) : undefined) ?? take(bad ? stage.neg : stage[side]) ?? (bad ? stage.neg! : stage[side])[1 - ja];
    if (!deck.size) continue;
    const e = enc(deck.deal(r)), gilt = r() < gold, shade = Math.floor(r()*8);
    if (row[p] + e.length > R){ col[p]++; row[p] = 0; if (col[p] >= C) continue; }
    const flags = (gilt ? 1 : 0) | (bad ? 2 : 0) | shade << 2;
    for (let k = 0; k < e.length; k++) grid[(p*C + col[p])*R + row[p] + k] = e[k] | flags << 11;
    row[p] += e.length + 1;
  }
  const fill = (p: number) => col[p] >= C ? C : col[p] + Math.min(1, row[p]/R), F = Math.max(fill(0), fill(1)), U = Math.ceil(F);
  // (only the columns in use are kept: U of them on each post)
  room(2*U*R);
  for (let p = 0; p < 2; p++) cells.set(grid.subarray(p*C*R, (p*C + U)*R), used + p*U*R);
  used += 2*U*R;
  return F;
}
/** Write every gate that has a record. heightOf: its height, metres. iD, iE: per gate, as torii.frag.glsl reads them. */
export function writeGates(heightOf: (i: number) => number, iD: Float32Array, iE: Float32Array){
  if (!WRITING) return null;
  const t0 = performance.now();
  SLOTS.forEach((s, i) => {
    const n = NIGHT.get(s.day) ?? (s.night && s.day > LAST ? guess(s.day, s.night.dm) : undefined), stage = stageOf(s.day);
    if (!n || !stage) return;
    const [, state, people, night, gold, kana, hidden] = n, h = heightOf(i);
    const R = Math.floor(SPAN*h/CELL), C = Math.floor(Math.PI*RADIUS*h/PITCH), off = used;
    const own = MOMENTS.get(s.day), front = writeFace(stage, own, 'front', people, gold, kana, hidden, C, R, s.day*2 + 1), back = writeFace(stage, own, 'back', night, gold, kana, hidden, C, R, s.day*2 + 2);
    iD.set([front, back, off, R], i*4); iE.set([C, gold, hidden, state ? 0 : 1], i*4);
  });
  const H = Math.ceil(used/CELLS_WIDTH), bytes = new Uint8Array(CELLS_WIDTH*H*2);
  bytes.set(new Uint8Array(cells.buffer, 0, used*2));
  const t = new THREE.DataTexture(bytes, CELLS_WIDTH, H, THREE.RGFormat, THREE.UnsignedByteType);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true;
  console.info(`writing: ${CHARS.length} characters, ${INK_GX}x${INK_GY} tiles, ink ${inkMean.toFixed(3)}, ${atlasMs.toFixed(1)} ms; ${used} cells, ${CELLS_WIDTH}x${H}, ${(performance.now() - t0).toFixed(1)} ms`);
  cells = new Uint16Array(0);
  return t;
}
