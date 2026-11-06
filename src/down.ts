/* =====================================================================
   DOWN THE PAGE — everything the page writes vertically is set one character at a time, each in its own ordinary box, the boxes stacked in a column. Not the browser's vertical
   writing (writing-mode): Safari on an iPhone draws vertical text half a character to the right of its box, and a box with any opacity then cuts off what sticks out (seen on a real
   phone, 2026-11-05: 〇 became C). Chromium does not do it, so no emulation shows it. A character in a box of its own comes out centred in every browser. What vertical setting does by
   hand is done here, as src/writing.ts does for the posts: commas and full stops to the upper right, small kana up and to the right, the long vowel and brackets turned, and the marks
   the font draws to the left of their box, for running across, brought to the middle (the amounts are in src/style.css).
   ===================================================================== */
export const SMALL = 'ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮ';
const PLACE = new Map<string, string>();
for (const [place, chars] of [
  ['up', '，、。．'], ['sm', SMALL], ['ex', '！'], ['qu', '？'], ['co', '：；'],
  ['turn', 'ー—―…‥～〜~-－_（）()「」『』【】《》〈〉［］[]｛｝{}=＝'],
]) for (const c of chars) PLACE.set(c, place);
/** None of these begins a column. */
const NOT_FIRST = '，、。．.！？：；:;）)」』】》〉ー　' + SMALL;
const ESCAPE: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };
const glyph = (c: string) => { const p = PLACE.get(c); return `<i${p ? ` class="${p}"` : ''}>${ESCAPE[c] ?? c}</i>`; };

/** The marks at their full width, and any run of spaces as one full-width space. */
const tidy = (t: string) => t.replace(/,/g, '，').replace(/!/g, '！').replace(/\?/g, '？').replace(/\s+/g, '　');

/** Markup for a text written down the page, right to left, in columns of at most so many characters. Whoever holds it gives the whole text as its aria-label. */
export function downHtml(text: string, perColumn = Infinity){
  const cs = [...tidy(text)], cols: string[][] = [];
  for (let k = 0; k < cs.length; ){
    let end = Math.min(cs.length, k + perColumn);
    // (no last column of one or two characters: 舰长 stays together, not 长 alone)
    if (end < cs.length && cs.length - end < 3) end = Math.max(k + 1, cs.length - 3);
    // (and what may not begin a column takes the character before it along, so a column never runs over)
    while (end < cs.length && end > k + 1 && NOT_FIRST.includes(cs[end])) end--;
    cols.push(cs.slice(k, end));
    k = end;
  }
  return `<span class="down" aria-hidden="true">${cols.map(c => `<span class="col">${c.map(glyph).join('')}</span>`).join('')}</span>`;
}
export function writeDown(el: HTMLElement, text: string, perColumn?: number){
  el.innerHTML = downHtml(text, perColumn);
  el.setAttribute('aria-label', text);
}
