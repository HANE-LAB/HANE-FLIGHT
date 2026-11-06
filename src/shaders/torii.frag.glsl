#include <flight/scene>
// A gate (src/toriimodel.ts), in three grades: plain wood, vermilion lacquer, and vermilion with gilt, rope and paper.
// aPart: 0 post, 1 foot, 2 ring, 3 tie beam, 4 wedge, 5 strut, 6 second beam, 7 top beam, 8 its cap, 9 gilt, 10 plaque,
// 11 rope, 12 paper, 13 wood, 14 the end grain of a log, 15 a bare board, 16 the snow lying on a beam.
// The tones are cut on the fixed key as ever (Voyage, GGXrd); on them go what paint would put: the shade under each beam, the
// light of its own lantern, a hard highlight along the lacquer, a cool edge on the shaded side, and close up its surface.
varying vec3 vC; varying vec3 vN; varying vec3 vW; varying vec3 vP; varying float vPart;
varying vec3 vGate;   // kind (0 plain wood, 1 vermilion, 2 feathered), lantern, day (torii.vert.glsl)
varying float vQ;     // how far it has come into being (0 … 1, on to 2)
varying float vDate;  // what its plaque says: which two columns of src/plaque.ts's atlas
uniform sampler2D tDates;
float h31(vec3 p){ p = fract(p*vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y)*p.z); }
float vn3(vec3 p){
  vec3 i = floor(p), f = fract(p); f = f*f*(3.0 - 2.0*f);
  return mix(mix(mix(h31(i), h31(i + vec3(1, 0, 0)), f.x), mix(h31(i + vec3(0, 1, 0)), h31(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(h31(i + vec3(0, 0, 1)), h31(i + vec3(1, 0, 1)), f.x), mix(h31(i + vec3(0, 1, 1)), h31(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
bool partIs(float k){ return abs(vPart - k) < 0.5; }
// one column of the plaque: p on the board, the column's corner and size there, which tile; gradients of p, for the mip
float dateInk(vec2 p, vec2 at, vec2 size, float tile, vec2 gx, vec2 gy){
  vec2 t = (p - at)/size;
  if (t.x < 0.0 || t.x > 1.0 || t.y < 0.0 || t.y > 1.0) return 0.0;
  vec2 cell = vec2(mod(tile, 8.0), floor(tile/8.0)) + vec2(t.x, 1.0 - t.y);
  return textureGrad(tDates, cell/8.0, gx/size*vec2(0.125, -0.125), gy/size*vec2(0.125, -0.125)).r;
}
#if WRITING
// One person, one line, up the posts (src/writing.ts): a character is a cell, rows down the post, columns round it. Near to, each cell
// looks up which character it holds and reads it from the atlas at the mip its size on screen asks for. From a cell of about three
// pixels on there is nothing to read and the table would only shimmer, so it fades to what the writing comes to there: the band
// of the post that is written, filtered by the size of a pixel, in its mean colour. So far gates cannot flicker or moire.
flat varying vec4 vWrit;    // columns written on a post, on the face she flies at and on the back; where the gate's cells start; rows in a column
flat varying vec4 vWrit2;   // columns round half a post; the part in gold; the part written cold, the room's anger; 1 where the record is worn away
uniform sampler2D tInk; uniform sampler2D tCells; uniform float uInkMean; uniform float uLent;
const float W_TOP = 0.745, W_SPAN = 0.54, W_R = 0.0395, W_PI = 3.14159265, W_FAR = 1.7, INK_TILE = 64.0;
const vec3 INK_PALE = vec3(0.80, 0.75, 0.64), INK_GOLD = vec3(0.98, 0.68, 0.26), INK_COLD = vec3(0.70, 0.80, 1.0);
float writing(out vec3 paint, out float hidden){
  paint = INK_PALE; hidden = 0.0;
  float sx = vP.x < 0.0 ? -1.0 : 1.0;
  vec2 rel = vec2(sx*(vP.x - sx*(0.31 - 0.0175*vP.y)), vP.z);   // from the post's axis: outward from the line, and along it
  bool backFace = rel.y > 0.0;
  float F = backFace ? vWrit.y : vWrit.x, C = vWrit2.x, R = vWrit.w;
  if (F <= 0.0) return 0.0;
  float j = (atan(rel.x, abs(rel.y))/W_PI + 0.5)*C, r = (W_TOP - vP.y)/W_SPAN*R;   // column (from the line's side outward), row (from the top)
  vec2 dj = vec2(dFdx(j), dFdy(j)), dr = vec2(dFdx(r), dFdy(r));
  float wj = max(length(dj), 1e-4), wr = max(length(dr), 1e-4), t = smoothstep(0.22, 0.45, max(wj, wr));
  // it starts a little round from the line's side, where it faces her all the way in; what does not fit going outward comes back inward
  float J0 = floor(C*0.22), hi = J0 + min(F, C - J0), lo = J0 - max(F - (C - J0), 0.0);
  float band = (clamp((j - lo)/wj + 0.5, 0.0, 1.0) - clamp((j - hi)/wj + 0.5, 0.0, 1.0))*clamp(r/wr + 0.5, 0.0, 1.0)*clamp((R - r)/wr + 0.5, 0.0, 1.0);
  // the far look: all that ink, spread out. A gate's lines are not all written (the gaps between them), hence 0.84; the aspect takes the gaps between columns
  float asp = W_PI*W_R*R/(C*W_SPAN), worn = vWrit2.w;
  // (from far off a little more than that where it is only a few columns, or the amount, which is all there is to see from there, would not be seen;
  // a little less where the post is full, or it stops being lacquer with writing on it. Only close enough to read does it come up to full strength)
  float many = smoothstep(2.0, 9.0, F), quiet = 1.0 - 0.22*many;
  float ink = uInkMean*0.84/asp*mix(quiet, W_FAR, smoothstep(0.25, 0.60, wr)*(1.0 - many))*band*(1.0 - 0.45*worn);
  // (while a column is still wider than a couple of pixels the band keeps its columns, one harmonic of them, broken into the length of a line; gone before it could alias)
  float each = smoothstep(0.50, 0.30, wj);
  if (each > 0.0){
    float h = fract(sin(floor(j)*12.9898 + vGate.z*0.37)*43758.5453);
    ink *= (1.0 - 0.8*each*cos(2.0*W_PI*j))*(1.0 - 0.55*each*(0.5 + 0.5*cos(2.0*W_PI*(r/(4.6 + 2.6*h) + 7.0*h))));
  }
  paint = mix(mix(INK_PALE, INK_GOLD, vWrit2.y), INK_COLD, vWrit2.z);
  // (that part keeps its lines further off than the rest: it is gone before it could shimmer)
  float th = smoothstep(0.40, 0.75, max(wj, wr));
  if ((t < 1.0 || (uFlash.w > 0.01 && th < 1.0)) && r >= 0.0 && r < R){
    float jc = floor(j), rc = floor(r), U = ceil(F);
    float k = jc >= J0 ? jc - J0 : C - 1.0 - jc;   // this column, in the order they were written
    float cellInk = 0.0, cellHidden = 0.0; vec3 cellPaint = paint;
    if (k < U && jc >= 0.0 && jc < C){
      int at = int(vWrit.z + 0.5) + (backFace ? 2*int(ceil(vWrit.x))*int(R) : 0) + ((vP.x < 0.0 ? int(U) : 0) + int(k))*int(R) + int(rc);
      vec2 cell = texelFetch(tCells, ivec2(at % CELLS_W, at/CELLS_W), 0).rg;
      float val = floor(cell.r*255.0 + 0.5) + 256.0*floor(cell.g*255.0 + 0.5), g = mod(val, 2048.0), flags = floor(val/2048.0);
      if (g > 0.5){
        // a character keeps its square whatever the cell's shape; it reads left to right on whichever side the reader is
        bool flip = (sx > 0.0) != backFace;
        float gu = ((flip ? 1.0 - fract(j) : fract(j)) - 0.5)*asp + 0.5, gv = fract(r);
        if (gu > 0.0 && gu < 1.0){
          vec2 grid = vec2(INK_GX, INK_GY), uv = (vec2(mod(g, INK_GX), floor(g/INK_GX)) + vec2(gu, gv))/grid;
          vec2 gx = vec2((flip ? -dj.x : dj.x)*asp, dr.x)/grid, gy = vec2((flip ? -dj.y : dj.y)*asp, dr.y)/grid;
          float a;
          // nights known only by their numbers: the writing is there, worn past reading. Whatever the distance or the angle, no finer than a few texels a character
          if (worn > 0.5){
            vec3 q = vec3(j, r, vGate.z);
            vec2 rub = vec2(vn3(q*vec3(4.0, 4.0, 1.0)), vn3(q*vec3(4.0, 4.0, 1.0) + 17.0)) - 0.5;
            vec2 at2 = clamp(vec2(gu, gv) + rub*0.20, 0.02, 0.98);
            a = textureLod(tInk, (vec2(mod(g, INK_GX), floor(g/INK_GX)) + at2)/grid, max(3.3, log2(max(wj*asp, wr)*INK_TILE))).r;
            a *= smoothstep(0.0, 0.16, at2.x)*smoothstep(1.0, 0.84, at2.x)*smoothstep(0.0, 0.16, at2.y)*smoothstep(1.0, 0.84, at2.y);
            a *= (0.25 + 0.75*smoothstep(0.34, 0.66, vn3(q*vec3(2.3, 2.3, 1.0))))*(0.40 + 0.60*smoothstep(0.30, 0.70, vn3(q*vec3(0.7, 0.2, 1.0))))*0.72;
          } else a = textureGrad(tInk, uv, gx, gy).r;
          bool gilt = mod(flags, 2.0) > 0.5, bad = mod(floor(flags/2.0), 2.0) > 0.5;
          float sh = 0.84 + 0.16*floor(flags/4.0)/7.0;   // no two hands the same
          // (the room's anger is written in the open, cold; the lightning makes it flare)
          cellInk = a*sh*mix(1.0, quiet, smoothstep(0.07, 0.20, max(wj, wr))); cellPaint = bad ? INK_COLD : gilt ? INK_GOLD : INK_PALE;
          if (bad) cellHidden = a;
        }
      }
    }
    ink = mix(cellInk, ink, t); paint = mix(cellPaint, paint, t); hidden = cellHidden*(1.0 - th);
  }
  hidden += uInkMean*0.84/asp*band*vWrit2.z*th;
  float gone = 1.0 - smoothstep(300.0, 470.0, length(cameraPosition - vW));
  hidden *= gone;
  return ink*gone;
}
#endif
#if WRITING
#define LACQUER lacquer
#else
#define LACQUER ct
#endif
void main(){
  vec3 n = normalize(vN), v = normalize(cameraPosition - vW);
  float dist = length(cameraPosition - vW), close = 1.0 - smoothstep(70.0, 190.0, dist);
  vec3 c = vC;
  float seed = fract(vGate.z*0.6180339887)*40.0;
  bool wood = partIs(13.0) || partIs(14.0) || partIs(15.0);
  // along a post the grain and the streaks run up it, along a beam across
  bool upright = partIs(0.0) || partIs(1.0) || partIs(5.0) || partIs(4.0) || partIs(15.0) || (partIs(13.0) && abs(n.y) < 0.55 && abs(vP.x) > 0.25 && abs(vP.x) < 0.35 && vP.y < 0.89);
  vec3 g = upright ? vec3(vP.x*70.0, vP.y*5.0, vP.z*70.0) : vec3(vP.x*5.0, vP.y*70.0, vP.z*70.0);
  if (wood){
    // bare hinoki, a little different from gate to gate: grain, darker with damp toward the foot; rings on the end grain
    float gr = vn3(g + seed);
    c *= (0.86 + 0.20*fract(seed*3.7))*(0.82 + 0.34*gr*close + 0.17*(1.0 - close));
    if (close > 0.0) c *= 1.0 - 0.14*close*smoothstep(0.62, 0.78, vn3(g*vec3(3.0, 0.6, 3.0) + seed));
    c *= mix(0.62, 1.0, smoothstep(-0.05, 0.42, vP.y));
    if (partIs(14.0)){ float ring = length(vP.yz - vec2(0.935, 0.0)); c = mix(vec3(0.66, 0.54, 0.34), vec3(0.42, 0.32, 0.18), 0.5 + 0.5*sin(ring*420.0)); }
  } else if (partIs(0.0) || partIs(2.0) || partIs(3.0) || partIs(4.0) || partIs(5.0) || partIs(6.0)){
    // the lacquer: darker where it has weathered, in streaks down from the joints, a little different from gate to gate
    c *= 0.90 + 0.18*fract(seed*2.3);
    if (close > 0.0){
      float st = vn3(g + seed);
      c *= 1.0 - close*(0.16*smoothstep(0.52, 0.80, st) + 0.08*smoothstep(0.70, 0.95, vn3(g*vec3(2.7, 0.7, 2.7) + seed*1.7)));
    }
  }
  float dark = 1.0 - smoothstep(0.05, 0.22, max(c.r, max(c.g, c.b)));
  vec3 ct = c + vec3(0.040, 0.040, 0.085)*dark;   // black lacquer reads as ink blue
  // four tones by which way a face turns (Voyage's toriiToon): to the key, away, up to the night sky, down to the lamps
  float side = keyLit(n);
  float top = smoothstep(0.45, 0.60, n.y), bot = smoothstep(0.45, 0.60, -n.y);
  vec3 litC = ct*vec3(0.50, 0.34, 0.44);
  litC *= 1.0 + 0.12*smoothstep(0.55, 0.62, dot(n, uKey));
  vec3 shdC = ct*vec3(0.33, 0.26, 0.46) + vec3(0.010, 0.012, 0.030);
  vec3 col = mix(shdC, litC, side);
  col = mix(col, mix(ct*vec3(0.62, 0.55, 0.92) + vec3(0.030, 0.036, 0.080), vec3(0.15, 0.16, 0.25), dark), top);
  col = mix(col, ct*vec3(0.36, 0.27, 0.44), bot);
  // the shade each beam throws on what is under it (painted in shape units, as a contact shadow would fall)
  float y = vP.y, shade = 1.0;
  if (partIs(0.0) || partIs(1.0) || partIs(13.0)) shade *= (1.0 - 0.34*smoothstep(0.57, 0.625, y)*(1.0 - smoothstep(0.625, 0.70, y)))*(1.0 - 0.28*smoothstep(0.70, 0.79, y));
  if (partIs(2.0)) shade *= mix(0.62, 1.0, smoothstep(0.796, 0.815, y));
  if (partIs(5.0)) shade *= 1.0 - 0.42*smoothstep(0.76, 0.83, y);
  if (partIs(6.0)) shade *= 0.74 + 0.26*smoothstep(0.0, 0.02, y - 0.83);
  col *= shade*(1.0 - 0.30*uWet);
#if WRITING
  // the writing lies on the lacquer and takes its light: paler than the lacquer, under the bloom's threshold
  float inkHidden = 0.0; vec3 lacquer = ct;   // (what the lightning and the sun light: the lacquer comes up to meet the writing and it sinks in, not all of it goes white)
  if (partIs(0.0) && dist < 470.0){
    vec3 paint; float ink = writing(paint, inkHidden);
    ink *= 1.0 - 0.80*uLent;   // (in a lightning asked for, what everyone could see sinks back into the dark)
    col = mix(col, paint*mix(vec3(0.40, 0.37, 0.46), vec3(0.74, 0.68, 0.62), side)*shade*(1.0 - 0.30*uWet), ink);
    ct = mix(ct, paint, ink);
  }
#endif
  // the cold: snow lying on whatever faces up; and, since the lens is under the beams and never sees their tops, the snow on the
  // top beam and the tie beam showing over their front edges, in a wandering line
  if (uSnow > 0.0){
    float edge = vn3(vec3(vP.x*38.0, seed, vP.z*20.0))*0.022;
    float lie = smoothstep(0.15, 0.45, n.y);
    if (partIs(7.0) || partIs(8.0)) lie = max(lie, smoothstep(0.0, 0.004, vP.y - edge - 0.872 - 0.040*pow(min(1.0, abs(vP.x)/0.58), 2.2) - 0.018));
    if (partIs(6.0)) lie = max(lie, smoothstep(0.0, 0.004, vP.y - edge - 0.855 - 0.040*pow(min(1.0, abs(vP.x)/0.58), 2.2)));
    if (partIs(3.0)) lie = max(lie, smoothstep(0.0, 0.004, vP.y - edge - 0.650));
    if (partIs(13.0) && abs(vP.y - 0.935) < 0.05) lie = max(lie, smoothstep(0.0, 0.004, vP.y - edge - 0.930));
    if (partIs(13.0) && abs(vP.y - 0.70) < 0.03) lie = max(lie, smoothstep(0.0, 0.004, vP.y - edge - 0.698));
    col = mix(col, mix(vec3(0.34, 0.40, 0.58), vec3(0.72, 0.78, 0.92), max(side, top)), partIs(16.0) ? 1.0 : uSnow*lie);
  }
  // in a storm water runs down the posts, in bright broken threads (wet lacquer shines harder, Lagarde; that it is darker too is only how it is painted here)
  if (uWet > 0.0 && close > 0.0 && upright){
    float run = vn3(vec3(vP.x*150.0, vP.y*9.0 + uTime*2.4, vP.z*150.0 + seed));
    col += vec3(0.20, 0.23, 0.32)*uWet*close*smoothstep(0.66, 0.78, run)*(0.35 + 0.65*side);
  }
  // the gilt: its own bright and dark, and a hard glint; engraved lines round the sleeves
  if (partIs(9.0) || (partIs(10.0) && c.r > 0.3)){
    col = mix(c*vec3(0.34, 0.30, 0.36), c*vec3(0.86, 0.80, 0.70), side);
    col = mix(col, c*vec3(0.72, 0.68, 0.74), top);
    if (partIs(9.0) && close > 0.0) col *= 1.0 - 0.32*close*smoothstep(0.82, 0.96, sin(vP.x*520.0));
  }
  if (partIs(11.0)) col = mix(ct*vec3(0.24, 0.22, 0.34), ct*vec3(0.62, 0.56, 0.58), smoothstep(-0.1, 0.5, dot(n, uKey) + 0.35*n.y));   // the rope
  if (partIs(12.0)) col = mix(vec3(0.17, 0.18, 0.28), vec3(0.42, 0.42, 0.50), 0.5 + 0.5*n.z*sign(uKey.z));   // the paper
  // 神額: that night's date, on whichever face is being read (x runs to the reader's right): the month large on the right, the
  // day small on the left. Pale on the lacquer, gold on the big nights, ink on bare wood
  bool plain = partIs(15.0);
  if ((plain || (partIs(10.0) && c.r < 0.3)) && abs(n.z) > 0.7 && dist < 260.0){
    vec2 pl = vec2(vP.z < 0.0 ? -vP.x : vP.x, vP.y - (plain ? 0.812 : 0.752)), gx = dFdx(pl), gy = dFdy(pl);
    float sm = floor((vDate + 0.5)/64.0), bg = floor(vDate + 0.5 - 64.0*sm);
    float ink = max(dateInk(pl, vec2(-0.005, -0.049), vec2(0.050, 0.098), bg, gx, gy), dateInk(pl, vec2(-0.043, -0.049), vec2(0.034, 0.098), sm, gx, gy));
    col = mix(col, plain ? vec3(0.018, 0.016, 0.022) : vGate.x > 1.5 ? vec3(0.86, 0.60, 0.20) : vec3(0.60, 0.55, 0.46), ink);
  }
  // its own lantern warms the inside faces and the undersides; her fire as she passes
  float own = max(vGate.y, 0.0)*exp(-length(vP.xy - vec2(0.0, 0.515))*2.6)*(0.45 + 0.55*max(0.0, -dot(n, normalize(vec3(vP.x, vP.y - 0.515, vP.z)))))
    *(1.0 - 0.75*smoothstep(0.55, 1.0, uDawn));   // daylight drowns the lantern's light on the wood
  float warmth = partIs(12.0) ? 1.6 : 0.35 + 0.65*ct.r;
  col += vec3(1.0, 0.46, 0.18)*own*0.40*warmth + fireLight(vW, n)*ct*0.7 + sunLight(n, LACQUER)*0.9 + flashLight(n, LACQUER);
  // a hard highlight along the lacquer, and on the gilt a harder one; a cool line of light on the shaded edge
  if (!wood && !partIs(11.0) && !partIs(12.0)){
    vec3 hv = normalize(uKey + v);
    float gilt = partIs(9.0) || (partIs(10.0) && c.r > 0.3) ? 1.0 : 0.0;
    float sp = smoothstep(mix(0.965, 0.93, gilt), mix(0.985, 0.95, gilt), dot(n, hv));
    col += mix(vec3(0.20, 0.13, 0.16) + 0.15*dark*vec3(0.5, 0.6, 1.0), vec3(0.42, 0.34, 0.20), gilt)*sp*shade*(1.0 + 1.5*uWet);
    col += vec3(0.12, 0.15, 0.30)*pow(1.0 - abs(dot(n, v)), 3.0)*(1.0 - side)*(1.0 - bot);
  }
  col = max(mix(vec3(dot(col, vec3(0.299, 0.587, 0.114))), col, 1.07), 0.0);
  // it condenses out of the cloud in patches, the colour of cloud; then fire runs out along it from the lantern, a line of
  // embers (the one part of it allowed over the bloom threshold), and what it has passed is the gate's own colour
  float alpha = gateAlpha(vW);   // (a statement of its own: Direct3D's compiler fails on it, with its discard, inside a longer expression)
  float patchy = vn3(vP*34.0 + seed);
  alpha *= smoothstep(0.0, 0.25, vQ - 0.18 - 0.30*patchy);
  float d = length(vP.xy - vec2(0.0, 0.515)) + 0.09*(vn3(vP*16.0 + seed) - 0.5), front = (vQ - 0.46)*1.55;
  col = underBloom(mix(uCloudLit*(0.60 + 0.28*side), col, smoothstep(front + 0.025, front - 0.025, d)));
#if WRITING
  // the room's anger: as the lightning goes over it flares, cold, a little over the threshold. If the light is asked for it stays: the gate and every other word go dark round it, and only those are left
  col *= mix(vec3(1.0), vec3(0.30, 0.34, 0.54), uLent);
  col = mix(col, vec3(0.86, 0.96, 1.25), inkHidden*smoothstep(0.03, 0.26, uFlash.w)*smoothstep(front - 0.02, front - 0.12, d));
#endif
  col += vec3(1.5, 0.52, 0.12)*2.2*exp(-pow((d - front)/0.035, 2.0))*(1.0 - smoothstep(0.98, 1.22, vQ))*step(0.40, vQ);
  gl_FragColor = vec4(hazeLight(col, vW), alpha);
}
