import { HAND } from './fonts';
import * as THREE from 'three';
import { SLOTS, fmtDate } from './data';

/* =====================================================================
   PLAQUE — what each gate's 神額 says: the date of its night, written as a plaque is, top to bottom, right to left. The month is
   large in the right column: it can be read in flight. The day is small in the left column: slow down or stop to read it. The
   first gate of each year has the year where the month goes and the whole date small beside it.
   One atlas of columns, drawn once at load in the page's own hand (src/fonts.ts), one channel; each gate only carries which two columns it
   shows (plaqueCode). The shader lays them out on the board (torii.frag.glsl, keep the sizes the same as COLUMN below).
   ===================================================================== */
const TILE_W = 128, TILE_H = 256, GRID = 8;
const FONT = `${HAND},"Yu Mincho","YuMincho","Hiragino Mincho ProN","Noto Serif CJK JP","Noto Serif CJK SC","Source Han Serif","Songti SC","SimSun","MS Mincho",serif`;
/** The two columns' width over height on the board. */
const COLUMN = { big: 0.050/0.098, small: 0.034/0.098 };
const DIGIT = '〇一二三四五六七八九';
export const dayText = (d: number) => (d <= 10 ? (d === 10 ? '十' : DIGIT[d]) : d < 20 ? '十' + DIGIT[d - 10] : d === 20 ? '二十' : d < 30 ? '廿' + DIGIT[d - 20] : d === 30 ? '三十' : '卅' + DIGIT[d - 30]) + '日';
export const monthText = (m: number) => (m <= 10 ? (m === 10 ? '十' : DIGIT[m]) : '十' + DIGIT[m - 10]) + '月';
export const yearText = (y: number) => [...String(y)].map(c => DIGIT[Number(c)]).join('');

const canvas = document.createElement('canvas'); canvas.width = TILE_W*GRID; canvas.height = TILE_H*GRID;
const x = canvas.getContext('2d', { willReadFrequently: true })!;
x.fillStyle = '#000'; x.fillRect(0, 0, canvas.width, canvas.height);
x.fillStyle = x.strokeStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
let nextTile = 0;
/** Draw a column in the next tile. size: the characters' height, as a part of the column's; bottom: sit it at the foot of the column. */
function column(text: string, aspect: number, size: number, bottom: boolean, weight: number){
  const tile = nextTile++, chars = [...text], px = size*TILE_H;
  const cx = (tile%GRID + 0.5)*TILE_W, top = Math.floor(tile/GRID)*TILE_H;
  // (a tile is stretched onto its column; a character is widened when there is room, as a plaque's are)
  const fit = 0.5/aspect*Math.min(1.5, 0.94*aspect/size);
  const y0 = bottom ? TILE_H*0.985 - chars.length*px : (TILE_H - chars.length*px)/2;
  x.font = `700 ${px}px ${FONT}`; x.lineWidth = px*weight;
  chars.forEach((c, i) => {
    x.save(); x.translate(cx, top + y0 + (i + 0.5)*px); x.scale(fit, 1);
    x.fillText(c, 0, 0); x.strokeText(c, 0, 0);
    x.restore();
  });
  return tile;
}
const big = (t: string) => column(t, COLUMN.big, t.length <= 2 ? 0.47 : t.length === 3 ? 0.325 : 0.245, false, 0.035);
const small = (t: string) => column(t, COLUMN.small, 0.235, true, 0.05);
const MONTH = Array.from({ length: 12 }, (_, m) => big(monthText(m + 1)));
const DAY = Array.from({ length: 31 }, (_, d) => small(dayText(d + 1)));

const CODES = new Float32Array(SLOTS.length);
{
  let year = 0;
  SLOTS.forEach((s, i) => {
    const [Y, M, D] = fmtDate(s.day).split('.').map(Number);
    // (each year costs two more tiles; the grid has room for ten, and past that a year's first gate is one like the rest)
    if (Y !== year && nextTile + 2 <= GRID*GRID){ CODES[i] = big(yearText(Y)) + GRID*GRID*small(monthText(M) + dayText(D)); year = Y; }
    else { CODES[i] = MONTH[M - 1] + GRID*GRID*DAY[D - 1]; year = Y; }
  });
}
/** Which two columns a gate shows (the big one + 64 × the small one), for its iB.y. */
export const plaqueCode = (slot: number) => CODES[slot];

export const plaqueTex = (() => {
  const px = x.getImageData(0, 0, canvas.width, canvas.height).data, r = new Uint8Array(canvas.width*canvas.height);
  for (let i = 0; i < r.length; i++) r[i] = px[i*4];
  const t = new THREE.DataTexture(r, canvas.width, canvas.height, THREE.RedFormat, THREE.UnsignedByteType);
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true; t.anisotropy = 4; t.needsUpdate = true;
  return t;
})();
