/* =====================================================================
   KEY — the music is kept under a key stream (public/sound/, made by dev/music.mjs, undone in src/sound.ts): every byte of each piece is
   run through it, so that what a browser can save is not an audio file. OpenTracks asks that the viewer cannot take the music out by
   ordinary means; this is that, not strong encryption. Applying it twice gives the bytes back. dev/music.mjs imports this file as it is.
   The stream goes by where a byte is in the whole piece, so a part of it is undone on its own: from is where the part begins.
   ===================================================================== */
export function keyed(bytes: Uint8Array, id: string, from = 0){
  const seed = (0x5eed1d ^ Math.imul(id.charCodeAt(0), 0x9e3779b1)) | 0;
  let t = 0;
  for (let i = 0; i < bytes.length; i++){
    const n = from + i, j = n & 3;
    // (each four bytes of the piece have a word of the stream)
    if (j === 0 || i === 0){
      const s = (seed + Math.imul((n >>> 2) + 1, 0x6d2b79f5)) | 0;
      let x = Math.imul(s ^ (s >>> 15), 1 | s);
      x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
      t = (x ^ (x >>> 14)) >>> 0;
    }
    bytes[i] ^= (t >>> (8*j)) & 255;
  }
  return bytes;
}
