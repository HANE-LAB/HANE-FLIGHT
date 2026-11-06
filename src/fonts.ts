/* =====================================================================
   THE ONE FONT — a subset of LXGW WenKai, inside the page (src/figures/hane-kai.woff2, dev/font.py, THIRD_PARTY_NOTICES.md): so the posts, the
   plaques and the words on the screen are in the same hand on every machine, phones too. What is drawn into a texture at load must wait for it.
   ===================================================================== */
export const HAND = '"Hane Kai"';
await Promise.race([
  document.fonts.load(`700 64px ${HAND}`, '火羽ひのめ').catch(() => []),
  new Promise(done => setTimeout(done, 2000)),   // (if it does not come, the system's own serif)
]);
