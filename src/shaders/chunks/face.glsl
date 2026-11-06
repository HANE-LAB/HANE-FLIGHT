// The front of her head, as near to her portraits as a bird can come, drawn on a patch that covers it (art/bird/build.py face_patch): her small pale face, narrowing to the chin; a thick fringe down
// to her lashes (straight in her first portrait, swept to one side from her second); her hair at the sides, copper running to coral at its ends; big amber eyes set wide and low, dark at the top of the iris
// and light at the bottom, under a thick upper lash that flicks up at its outer end; a blush; and a small beak where her nose and mouth are. Under the chin it is the fire of her throat. Past its edge the
// real feathers begin, hair at the crown and the sides. It is drawn here and not painted, so it stays sharp however close the lens comes, and it can blink and look at you.
// uv: the patch, azimuth and elevation. open: 1 open, 0 shut. smile: which way the shut eye curves, 1 the happy ^ of her 2021 portrait. look: the viewer's direction from the head (azimuth, elevation, radians).
// uFaceC: pale, blush, lash, iris dark, iris middle, iris light, pupil, white of the eye, fine lines, glints, warm
uniform vec3 uFaceC[11];
float faceLine(float d, float half_, float w){ return 1.0 - smoothstep(half_ - w, half_ + w, abs(d)); }
float faceDot(vec2 p, vec2 c, float r, float w){ return 1.0 - smoothstep(r - w, r + w, length(p - c)); }
// the distance to a segment, and how far along it
vec2 faceSeg(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba)/dot(ba, ba), 0.0, 1.0); return vec2(length(pa - ba*h), h); }
// the small feathers of her throat: rows going out from the beak, each row's tips lying over the roots of the next. lp: log of the distance from the beak, the way round it, each in rows. + lit, - shade
float faceScales(vec2 lp){
  float fl = max(fwidth(lp.x), fwidth(lp.y)), r = floor(lp.x), g = fract(lp.y + 0.5*mod(r + 1.0, 2.0)) - 0.5, d = fract(lp.x) - 0.80*(1.0 - 4.0*g*g);
  return mix(-0.50*exp(-max(d, 0.0)*5.0), 0.20 + 0.55*min(d, 0.0), 1.0 - smoothstep(-fl, fl, d))*(1.0 - smoothstep(0.25, 0.60, fl));
}
vec4 faceAt(vec2 uv, float open, float smile, vec2 look){
  float az = (uv.x - 0.5)*3.70, el = mix(-1.30, 1.50, uv.y);
  // how far from the beak's axis and which way round it, as build.py's from_beak; the patch ends at face_rim, where the real feathers start
  vec3 dir = vec3(sin(az)*cos(el), sin(el), cos(az)*cos(el));
  float psi = acos(clamp(0.9759*dir.z - 0.2182*dir.y, -1.0, 1.0)), beta = atan(0.9759*dir.y + 0.2182*dir.z, abs(dir.x)), sb = sin(beta);
  float a = 1.0 - smoothstep(0.985, 1.0, psi*length(vec2(cos(beta)/1.40, sb/(sb > 0.0 ? 1.62 : 1.02))));
  if (a <= 0.0) return vec4(0.0);
  // x, y: where it lies as seen from straight in front, the head's radius 1: her portrait is drawn in these
  float x = dir.x, y = dir.y, ax = abs(x), wy = max(fwidth(y), 1e-4), near = 1.0 - smoothstep(0.02, 0.07, wy), dawn = mix(0.68, 1.0, uDawn);
  // her face, narrowing to the chin
  float fo = length(vec2(ax/(0.79*(1.0 - 0.32*smoothstep(-0.02, -0.72, y))), (y + 0.10)/0.76)), wo = max(fwidth(fo), 1e-4), inFace = 1.0 - smoothstep(1.0 - wo, 1.0 + wo, fo);
  // the fringe: strands to its cut, which lean as it sweeps across (from her second portrait). Their tips are only drawn when there are the pixels for them
  float xs = x + mix(0.05, 0.26, uM1)*(y - 0.40), tips = 1.0 - smoothstep(0.03, 0.09, wy);
  float cut = mix(0.43, 0.40, uM1) + 0.05*cos(xs*1.7) - tips*(mix(0.018, 0.055, uM1)*abs(fract(xs*3.3 + 0.3)*2.0 - 1.0) + mix(0.008, 0.028, uM1)*abs(fract(xs*7.1 + 0.1)*2.0 - 1.0));
  float fringe = smoothstep(cut - wy, cut + wy, y);
  // her hair: strands from the parting, a band of light round it
  vec2 pp = vec2(x + 0.16, 1.02 - y);
  float s = abs(fract(atan(pp.x, pp.y)*9.0)*2.0 - 1.0);
  vec3 hair = mix(uHairA, uHairB, smoothstep(-0.10, -0.75, y));
  hair *= 1.0 - 0.24*near*(1.0 - smoothstep(0.0, 0.24, s));
  hair *= 1.0 + 0.34*near*exp(-pow((length(pp) - 0.50)/0.06, 2.0))*(0.55 + 0.45*s);
  // the skin, pink in the shade of the fringe and on the cheeks; a pale cream would bloom into a white disc (see src/plume.ts)
  vec3 skin = mix(uFaceC[0], uFaceC[10], smoothstep(-0.30, -0.86, y)*0.6);
  skin = mix(skin, uFaceC[1], (1.0 - smoothstep(0.0, 0.13, cut - y))*0.45);
  vec2 b = vec2((ax - 0.56)/0.20, (y + 0.36)/0.11);
  skin = mix(skin, uFaceC[1], exp(-dot(b, b))*0.72);
  skin = mix(skin, fire(0.62), uYouth*0.10);
  // under the chin, the fire of her throat
  vec3 c = fire(0.50)*(1.0 + faceScales(vec2(log(psi + 0.08), beta)*5.0));
  c = mix(c, hair, smoothstep(-0.70, -0.52, y));
  c = mix(c, skin, inFace*(1.0 - fringe));
  c = mix(c*dawn, c*dawn*0.34 + fire(0.20)*0.20, uEmber*0.55);
  // the eyes are held under the bloom, or they would be a white blur (k)
  float k = mix(0.40, 0.56, uDawn)*(1.0 - 0.30*uEmber);
  c /= k;
  // q: the eye's own measure, 1 its half width and height. wx, qy: how much of it one pixel covers
  vec2 q = vec2((abs(az) - 0.48)/0.285, (el + 0.05)/0.31);
  float wx = max(fwidth(q.x), 1e-4), qy = max(fwidth(q.y), 1e-4), w = qy*0.75, L = max(wx, qy);
  // from far off the eye is only a soft dark spot, which moves smoothly: two or three pixels of lash and pupil drawn in full flicker as she moves, falling on and off the pixels.
  // It widens with the pixel and fades as it does, so what it adds to the picture stays the same
  float crisp = 1.0 - smoothstep(0.17, 0.36, L);
  vec3 far = c;
  if (crisp < 1.0){
    float sig = max(0.85, 1.15*L);
    vec2 g = (q - vec2(0.0, 0.08))/vec2(sig, sig);
    far = mix(c, mix(uFaceC[2], uFaceC[3], 0.40), min(1.0, 1.05/(sig*sig))*exp(-dot(g, g))*mix(0.60, 1.0, open));
    // (the beak's colour under the beak: a pixel or so across it would come and go)
    vec2 bq = vec2(az/0.17, (el + 0.27)/0.12);
    far = mix(far, fire(0.66)*0.75*dawn/k, exp(-dot(bq, bq))*0.9);
  }
  if (crisp > 0.0){
    // the corners of the beak turn up a little: her smile
    vec2 g0 = faceSeg(vec2(abs(az), el), vec2(0.105, -0.325), vec2(0.255, -0.285));
    c = mix(c, uFaceC[8], faceLine(g0.x/0.36, 0.024*(1.0 - 0.7*g0.y), w)*0.85);
    if (abs(q.x) < 1.8 && q.y > -1.5 && q.y < 2.1){
      float ex = q.x, ey = q.y, xc = clamp(ex, -1.0, 1.0), m = 1.0 - xc*xc, sx = 1.0 - smoothstep(1.0 - wx, 1.0 + wx, abs(ex));
      float topY = sqrt(m) - 0.08*ex, lowY = -0.90*pow(m, 0.65);
      // (shut, it is a line: down for a blink, up for a smile)
      float shut = mix(-0.30, 0.46, smile)*m - 0.04, yu = mix(shut, topY, open), yl = mix(shut, lowY, open);
      float inside = smoothstep(yl - w, yl + w, ey)*(1.0 - smoothstep(yu - w, yu + w, ey))*sx;
      if (inside > 0.0){
        vec3 e = mix(uFaceC[7], uFaceC[9], smoothstep(yu - 0.55, yu, ey)*0.75);
        // (the eye looks out along az 0.58, the way the head's surface faces there)
        vec2 h = clamp(vec2(sign(az)*look.x - 0.58, look.y + 0.05)/vec2(1.1, 0.9), -1.0, 1.0);
        vec2 ic = vec2(h.x*0.24, -0.02 + h.y*0.14), n = q - ic, d = n/vec2(0.70, 0.92);
        float r = length(d), wr = w*1.3;
        vec3 iris = mix(uFaceC[5], uFaceC[4], smoothstep(-0.9, -0.05, d.y));
        iris = mix(iris, uFaceC[3], smoothstep(0.0, 0.82, d.y));
        iris *= 1.0 + 0.10*sin(atan(d.x, d.y)*22.0)*smoothstep(0.3, 0.95, r)*(1.0 - smoothstep(0.03, 0.09, L));
        iris = mix(iris, uFaceC[3], smoothstep(0.84, 1.0, r)*0.85);
        iris = mix(iris, uFaceC[6], 1.0 - smoothstep(0.85, 1.15, length((n - vec2(0.0, 0.06))/vec2(0.17, 0.34))));
        iris = mix(iris, uFaceC[9], max(faceDot(n, vec2(-0.02, 0.68), 0.06, w), max(faceDot(n, vec2(0.16, 0.70), 0.05, w), faceDot(n, vec2(-0.20, 0.66), 0.05, w)))*0.8);
        iris = mix(iris, uFaceC[7], max(faceDot(n, vec2(-0.27, 0.44), 0.16, w), max(faceDot(n, vec2(0.31, 0.50), 0.07, w), faceDot(n, vec2(0.30, -0.62), 0.10, w))));
        e = mix(e, iris, 1.0 - smoothstep(1.0 - wr, 1.0 + wr, r));
        c = mix(c, e, inside);
      }
      // the upper lash, thick, tapering out past the corner and flicking up; the fine lines under the eye and over the lid
      float th = 0.17 + 0.17*m, dy = ey - yu;
      float lash = smoothstep(-w, w, dy)*(1.0 - smoothstep(th - w, th + w, dy))*sx;
      float ye = mix(mix(-0.30, 0.46, smile)*0.42 - 0.04, 0.70, open);
      vec2 s1 = faceSeg(q, vec2(0.72, ye + 0.10), vec2(1.44, ye - 0.04 + 0.16*open));
      lash = max(lash, 1.0 - smoothstep(mix(0.15, 0.015, s1.y) - w, mix(0.15, 0.015, s1.y) + w, s1.x));
      vec2 s2 = faceSeg(q, vec2(1.00, ye + 0.14), vec2(1.30, ye + 0.42));
      lash = max(lash, (1.0 - smoothstep(mix(0.05, 0.01, s2.y) - w, mix(0.05, 0.01, s2.y) + w, s2.x))*open);
      c = mix(c, uFaceC[8], faceLine(ey - yl, 0.03, w)*smoothstep(-0.2, 0.6, ex)*sx*open*0.8);
      c = mix(c, uFaceC[8], faceLine(ey - (topY + 0.40), 0.025, w)*(1.0 - smoothstep(0.86 - wx, 0.86 + wx, abs(ex)))*open*0.6);
      c = mix(c, uFaceC[2], lash);
    }
  }
  return vec4(mix(far, c, crisp)*k, a);
}
