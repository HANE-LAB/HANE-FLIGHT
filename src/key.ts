/* =====================================================================
   KEY — the music is kept under a key stream (public/sound/, made by dev/music.mjs, undone in src/sound.ts): every byte of each piece is
   run through it, so that what a browser can save is not an audio file. OpenTracks asks that the viewer cannot take the music out by
   ordinary means; this is that, not strong encryption. Applying it twice gives the bytes back. dev/music.mjs imports this file as it is.
   ===================================================================== */
export function keyed(bytes: Uint8Array, id: string){
  let s = (0x5eed1d ^ Math.imul(id.charCodeAt(0), 0x9e3779b1)) | 0;
  for (let i = 0; i < bytes.length; i += 4){
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    t = (t ^ (t >>> 14)) >>> 0;
    for (let j = 0; j < 4 && i + j < bytes.length; j++) bytes[i + j] ^= (t >>> (8*j)) & 255;
  }
  return bytes;
}
