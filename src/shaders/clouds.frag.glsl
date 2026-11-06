// The clouds (src/clouds.ts), drawn small and laid over the scene by src/post.ts. A voxel cloud with its lighting baked:
// each ray reads one texture per step and marches no second ray toward the light.
//   · Outside cloud it leaps by the deck's distance field, then by steps that grow with distance.
//   · On touching cloud it homes in on the skin by bisection, so every ray starts on the same surface and no slices show,
//     then takes short steps that lengthen going in (Schneider's cheap and full steps); each step's depth is integrated
//     exactly (Beer's law over the step), so few steps hold up (Toft et al. 2016).
//   · The view-dependent part is one phase value per pixel: the silver lining, toward the light.
//   · There is no accumulation over time, so a given camera always gives one picture.
// Near the flight line the deck is drawn back into a valley with a floor of cloud: she flies between its walls, the gates take
// shape in it, her fire and the lanterns light what is near them. Over all of it lies the mist she flies in: a short
// march of its own, in front of whatever the cloud march found, so what is ahead of her stays hidden until she is close.
// Output: light premultiplied by coverage, alpha = 1 - transmittance, stopped at the scene's depth. A second target takes
// one over the view depth where the cloud has become mostly opaque, so effects drawn after it (glows, wisps) are hidden by it.
layout(location = 0) out highp vec4 outColor;
layout(location = 1) out highp vec4 outOcc;
uniform sampler2D tDepth; uniform sampler3D tVol; uniform sampler3D tSdf; uniform sampler3D tNoise;
uniform float uNear; uniform float uFar; uniform mat4 uInvProj; uniform mat4 uCamWorld; uniform vec3 uCamPos;
uniform vec2 uDrift; uniform float uPxA;                  // the wind's drift; the angle one pixel of this image covers
uniform float uP; uniform float uH; uniform float uY0;   // the tile's size, the deck's height, the height it starts at
uniform float uCut;      // how much of the tile's cloud is cut away: raises the gaps
uniform float uCap; uniform float uCapN;      // how far the towers have gone down, where the sun has reached; and before it, all over
uniform float uFarT;     // how far a ray can see at all now: the march stops there
uniform float uSigma; uniform float uSdfMax; uniform float uSdfMargin;
uniform float uTube; uniform float uSlot; uniform float uSlotZ; uniform float uLampTo;
uniform vec4 uForm[FORMING];   // the gates condensing out of the cloud: z, height, how far each has come
uniform float uFog; uniform float uFogBase; uniform float uFogTop; uniform vec3 uFogTint; uniform float uFogFire;   // the mist: its density, per metre; how much of it is above the floor's own; how high it reaches; how much of the sky's colour it takes; how much of her fire
uniform vec3 uMoonL; uniform vec3 uSunL; uniform vec3 uKeyC; uniform vec3 uSunKeyC; uniform vec3 uAmbTop; uniform vec3 uAmbBot; uniform vec3 uFloorC;
uniform float uFront;    // where the sunlight has reached along the line (world z): cloud ahead of it is in the sun, behind it still in the night
uniform vec4 uFireA; uniform float uFireK; uniform float uLamp; uniform float uHold; uniform float uHaze;
uniform vec4 uBolt;      // lightning: where (x, top of the channel, z), how strong
uniform float uBoil;     // how far the fine noise has scrolled up through the cloud
uniform vec2 uFogRain;   // the mist drawn out up and down, and falling
#include <flight/path>
#include <flight/sky>
varying vec2 vUv;
// LINE_FAR: how far the valley is worth computing; FLOOR_TOP: above this no cloud stands in the valley's clear middle
const float LINE_FAR = 2600.0, FAR_T = 6000.0, THR = 0.004, FLOOR_TOP = 5.6;
float viewZ(float d){ return uNear*uFar/(uFar - d*(uFar - uNear)); }
vec2 slab(float y0, float y1, vec3 o, vec3 d){
  if (abs(d.y) < 1e-5) return (o.y >= y0 && o.y <= y1) ? vec2(0.0, 1e9) : vec2(1.0, 0.0);
  float ta = (y0 - o.y)/d.y, tb = (y1 - o.y)/d.y;
  return vec2(max(min(ta, tb), 0.0), max(ta, tb));
}
float ign(vec2 p){ return fract(52.9829189*fract(dot(p, vec2(0.06711056, 0.00583715)))); }
float hg(float c, float g){ float g2 = g*g; return (1.0 - g2)/pow(max(1.0 + g2 - 2.0*g*c, 1e-4), 1.5); }
// the valley's half width here: it breathes along the way, now close about her, now opening on the sky
float wideAt(float z){ return uTube*(1.0 + 0.45*sin(z/760.0 + 0.4) + 0.25*sin(z/311.0)); }

// what a step finds: density, the two kinds of light on it, and whether the sun has reached it
float gLight = 1.0, gSky = 1.0, gDay = 0.0;
float cloudAt(vec3 p, vec2 q, float t){
  vec3 w = p + vec3(uDrift.x, 0.0, uDrift.y);
  vec4 v = textureLod(tVol, vec3(w.x/uP, w.z/uP, (p.y - uY0)/uH), 0.0);
  // the tile's field, 0 at its surface. Drawing the surface back (iso) keeps its billows. The gaps wander over a distance
  // longer than the tile, so its repeat does not read
  float iso = uCut*(1.0 + 0.8*sin(p.x/1700.0 + 1.0)*sin(p.z/2300.0));
  gDay = smoothstep(uFront - 450.0, uFront + 450.0, p.z);
  gLight = mix(v.b*v.b, v.a*v.a, gDay); gSky = v.g;
  // in the last year and more she is near the top of the cloud, the towers lower (uCapN); where the sun has reached they go
  // down into the sea and the sky opens, all but a few far off
  iso += uCapN*smoothstep(26.0, 96.0, p.y);
  if (uCap > 0.0) iso += uCap*gDay*smoothstep(1.0, 42.0, p.y)*(1.0 - 0.9*smoothstep(0.30, 0.70, sin(p.x/1340.0 + 1.0)*sin(p.z/1930.0 + 0.5)));
  float nearLine = 1.0 - smoothstep(LINE_FAR*0.75, LINE_FAR, t), floorF = -1.0;
  if (nearLine > 0.0){
    // along the line the cloud draws back into a valley, open to the sky, down to its floor and no further. The floor is a deep
    // bed of cloud in long swells. What the valley lays bare is lit as open air, not as the heart of the tile it was
    float wide = wideAt(p.z);
    float open = (1.0 - smoothstep(wide*0.45, wide*1.5, abs(q.x)))*nearLine;
    if (open > 0.0){
      float fy = 3.0, crest = 1.0;
      if (q.y < FLOOR_TOP + 0.5){
        crest = clamp((textureLod(tNoise, w/230.0, 0.0).r - 0.55)/0.21, 0.0, 1.0);
        fy = -4.0 + 6.5*crest;
        floorF = open*(fy - q.y)/36.0;
      }
      iso += open*1.45*smoothstep(fy - 2.0, fy + 3.0, q.y);
      gLight = max(gLight, open*(0.05 + 0.25*crest)); gSky = max(gSky, open*0.42)*(0.5 + 0.5*crest);
    }
  }
  float tileF = v.r*2.0 - 0.6 - iso, field = max(tileF, floorF), erode = floorF > tileF ? 0.12 : 0.42;
  // the finest billows, where the voxels would show: near the skin only, they push it in and out and shade its folds. Close to
  // her the same noise is read at twice the frequency: this is the cloud that rushes past under her
  if (t < DETAIL_FAR && field > -0.35 && field < 0.55){
    float f = 1.0 - smoothstep(DETAIL_FAR*0.6, DETAIL_FAR, t), fine = 1.0 - smoothstep(70.0, 130.0, t);
    vec4 n = textureLod(tNoise, (w - vec3(0.0, uBoil, 0.0))/(fine > 0.5 ? 40.0 : 88.0), 0.0);
    float bn = clamp((n.g*0.625 + n.b*0.25 + n.a*0.125 - 0.30)/0.40, 0.0, 1.0);
    field -= (1.0 - bn)*erode*f*(fine > 0.5 ? 0.8 : 1.0);
    gLight *= mix(1.0, 0.40 + 1.15*bn, f);
    gSky *= mix(1.0, 0.62 + 0.70*bn, f);
  }
  return clamp(field/0.16, 0.0, 1.0)*smoothstep(1.5, 9.0, t)*(1.0 - smoothstep(uFarT*0.8, uFarT, t));
}
vec2 lineFrame(vec3 p, float t){ return t < LINE_FAR ? vec2(p.x - pathX(p.z), p.y - pathY(p.z)) : vec2(1e4); }
// the lanterns: pools of light along the line, as far as the gates have come up
float lampAt(vec3 p, vec2 q){
  float dz = (fract((p.z - uSlotZ)/uSlot + 0.5) - 0.5)*uSlot;
  return exp(-(q.x*q.x + dz*dz)/200.0)*exp(-(q.y - 12.0)*(q.y - 12.0)/300.0)*(1.0 - smoothstep(uLampTo - 26.0, uLampTo, p.z));
}

// the lightning's light on the cloud or the mist round it, cold. The channel is a line of light, and in a scattering medium light
// spreads by diffusion: the Green's function, exp(-r/L)/r, softened near the line
vec3 boltAt(vec3 p){ vec3 b = vec3(p.x - uBolt.x, p.y - clamp(p.y, 2.0, uBolt.y), p.z - uBolt.z); float r = length(b); return vec3(0.62, 0.70, 1.0)*uBolt.w*exp(-r/190.0)/(1.0 + r/70.0); }

// A gate condensing out of the cloud: a sheet of cloud in the gate's plane, its outline the gate's, torn by the cloud's noise; it
// gathers, then thins away as the fire runs along the gate inside it. One read of the noise, only for the pixels near one of
// these gates. g: z, height, how far it has come. Light and coverage.
vec4 gateSheet(vec4 g, vec3 o, vec3 d, float tCloud, float tScene){
  float h = g.y, q0 = g.z;
  if (h <= 0.0) return vec4(0.0);
  float tg = (g.x - 0.05*h - o.z)/max(d.z, 1e-3);
  float gat = smoothstep(0.0, 0.42, q0), go = 1.0 - smoothstep(0.48, 0.92, q0);
  // (over its own gate, a little in front of it; not over what stands nearer the lens, a gate already up or her)
  if (tg <= 1.0 || tg >= min(tCloud, tScene + 0.12*h) || gat*go <= 0.0) return vec4(0.0);
  vec3 p = o + d*tg; float cx = pathX(g.x), px = abs(p.x - cx), py = p.y - pathY(g.x);
  if (px > 0.76*h || py > 1.16*h || py < -8.0) return vec4(0.0);
  // how far from the gate's lines, in metres
  float dp = max(px - 0.34*h, 0.26*h - px), dk = max(px - 0.60*h, abs(py - 0.91*h) - 0.034*h), ds = max(px - 0.50*h, abs(py - 0.85*h) - 0.022*h), dn = max(px - 0.43*h, abs(py - 0.655*h) - 0.024*h);
  float dg = min(min(max(dp, py - 0.86*h), dk), min(ds, dn));
  vec4 nn = textureLod(tNoise, (p + vec3(uDrift.x, 0.0, uDrift.y))/46.0, 0.0);
  float bump = clamp((nn.r - 0.55)/0.21, 0.0, 1.0)*0.6 + clamp((nn.g*0.625 + nn.b*0.25 + nn.a*0.125 - 0.30)/0.40, 0.0, 1.0)*0.4;
  float fat = h*(0.012 + 0.075*gat), a = (1.0 - smoothstep(0.0, fat*1.2, dg - fat*(bump*1.5 - 0.5)))*go*gat;
  float rimL = bump*bump*(3.0 - 2.0*bump)*0.6 + 0.4;
  vec3 lum = mix(uAmbBot, uAmbTop, 0.75) + uKeyC*(uFront > 1e6 ? 0.42 : 0.3)*rimL + uSunKeyC*smoothstep(uFront - 450.0, uFront + 450.0, p.z)*0.30*rimL;
  lum += vec3(1.0, 0.50, 0.20)*0.30*smoothstep(0.40, 0.70, q0)*exp(-length(vec2(p.x - cx, py - 0.515*h))/(0.22*h));   // the fire inside
  // (no brighter than the rest of the cloud: not a light)
  return vec4(lum*min(1.0, uHold/max(dot(lum, vec3(0.299, 0.587, 0.114)), 1e-3)), a);
}

void main(){
  vec4 v = uInvProj*vec4(vUv*2.0 - 1.0, 1.0, 1.0); vec3 dv = normalize(v.xyz/v.w);
  vec3 d = normalize((uCamWorld*vec4(dv, 0.0)).xyz), o = uCamPos;
  float dz = textureLod(tDepth, vUv, 0.0).r;
  float tScene = dz >= 0.99999 ? 1e9 : viewZ(dz)/max(-dv.z, 1e-4);
  float tMax = min(tScene, uFarT);

  // the part of the ray to march: through the deck
  vec2 sa = slab(uY0, uY0 + uH, o, d);
  float tBeg = sa.x, tEnd = min(sa.y, tMax);

  vec3 scat = vec3(0.0); float T = 1.0, tFirst = 1e9, tOcc = 1e5;
  float cM = dot(d, uMoonL), cS = dot(d, uSunL);
  // the silver lining toward the light and the soft back-scatter away from it, one number per light for the whole ray (only
  // the moon's, all through the long night; only the sun's once it is up)
  float phM = uFront < -1e6 ? 0.0 : min(mix(hg(cM, -0.18), hg(cM, 0.72), 0.42), 3.0);
  float phS = uFront > 1e6 ? 0.0 : min(mix(hg(cS, -0.18), hg(cS, 0.72), 0.42), 3.0);
  float jit = ign(gl_FragCoord.xy);

  if (tEnd > tBeg){
    float coneK = min(uPxA*34.0, 0.06);   // (the cap is for a phone held upright: a wide lens on a small image would step too coarsely)
    float t = tBeg + jit*(1.0 + tBeg*coneK), tPrev = t;
    bool hot = false; int empties = 0, nHot = 0;
    // the budget counts what costs: a leap through empty air reads one small texture and counts a quarter
    float spent = 0.0;
    for (int i = 0; i < STEPS*3; i++){
      if (t >= tEnd || T < 0.02 || spent >= float(STEPS)) break;
      vec3 p = o + d*t;
      vec2 q = lineFrame(p, t);
      float den;
      if (!hot){
        float cone = 1.2 + t*coneK*(1.0 + t/2200.0);   // (coarser yet far off, where the cloud is already going into the haze)
        // how far is surely empty: up to where the ray enters the deck; in the valley's clear middle, until the ray reaches
        // its walls (at its own speed across the line) or comes down to its floor (by the ray's own course, not by its height
        // above them: a ray that grazes down toward a surface would creep); otherwise the distance field
        float skip = 1e5;
        if (t < sa.x) skip = sa.x - t;
        else {
          float lat = (wideAt(p.z)*0.42 - abs(q.x))/(abs(d.x) + 0.28*abs(d.z) + 0.02);
          float dn = d.y < 0.0 ? (q.y - FLOOR_TOP)/(0.012 - d.y) : (q.y > FLOOR_TOP ? 1e5 : 0.0);
          skip = min(lat, dn);
          if (skip <= cone){
            vec3 w = p + vec3(uDrift.x, 0.0, uDrift.y);
            skip = textureLod(tSdf, vec3(w.x/uP, w.z/uP, (p.y - uY0)/uH), 0.0).r*uSdfMax*0.9 - uSdfMargin;
          }
        }
        if (skip > cone){
          tPrev = t + min(skip, tEnd - t + 1.0); t = tPrev; spent += 0.25; continue;
        }
        den = cloudAt(p, q, t); spent += 1.0;
        if (den <= THR){
          // (each pixel's steps a little different: what a step skims past becomes a soft dither, not a saw-tooth)
          tPrev = t; t += cone*(0.7 + 0.6*fract(jit + float(i)*0.618)); continue;
        }
        // the skin is between the last empty sample and this one: home in on it
        float lo = tPrev, hi = t;
        for (int k = 0; k < REFINE; k++){
          float m = 0.5*(lo + hi); vec3 pm = o + d*m;
          if (cloudAt(pm, lineFrame(pm, m), m) > THR) hi = m; else lo = m;
        }
        t = hi; p = o + d*t; q = lineFrame(p, t);
        hot = true; empties = 0; nHot = 0;
      }
      den = cloudAt(p, q, t); spent += 1.0;
      // short steps at the skin, for a soft and exact edge; longer going in, where it no longer shows
      float dt = (0.7 + t*uPxA*1.4)*(1.0 + 0.7*float(nHot))*(0.92 + 0.16*jit);
      nHot++;
      if (den > THR){
        float Ts = exp(-uSigma*den*dt);
        // the key through the baked light; the sky by how open it is here and how high; powder: thin edges turned
        // from the light go dark, which is what draws a cauliflower's folds
        float pow_ = mix(1.0, 1.0 - exp(-den*5.0), 0.35*(0.5 - 0.5*mix(cM, cS, gDay)));
        float hh = clamp((p.y - uY0)/uH, 0.0, 1.0);
        vec3 lum = mix(uKeyC*phM, uSunKeyC*phS, gDay)*gLight*pow_ + mix(uAmbBot, uAmbTop, gSky*(0.45 + 0.55*hh));
        // where the sun has reached, the whole body glows warm with the light scattered through it; she looks into the sun,
        // at the cloud's shaded side, so the direct light alone would hardly show its coming
        lum += uSunKeyC*gDay*(0.07 + 0.20*gSky);
        // her fire warms what is near her; it only adds
        vec3 fa = p - uFireA.xyz;
        lum += vec3(1.0, 0.46, 0.20)*uFireA.w*exp(-dot(fa, fa)*uFireK);
        // the lanterns along the line
        if (t < LINE_FAR && uLamp > 0.0) lum += vec3(1.0, 0.58, 0.28)*uLamp*lampAt(p, q);
        if (uBolt.w > 0.0) lum += boltAt(p)*(0.30 + 0.70*gSky);
        scat += T*(1.0 - Ts)*lum;
        if (T > 0.3 && T*Ts <= 0.3) tOcc = min(tOcc, t + log(T/0.3)/(uSigma*den));   // (exactly where, by Beer's law: rays with different jitter must agree on it)
        tFirst = min(tFirst, t);
        T *= Ts;
      }
      if (den <= THR){ if (++empties >= 2){ hot = false; tPrev = t; } }
      else empties = 0;
      t += dt;
    }
  }
  // under the deck lies the deep of the cloud sea, seen through its gaps
  vec3 back = skyColor(normalize(vec3(d.x, max(d.y, 0.015), d.z)));
  if (T > 0.01 && d.y < -1e-3 && tScene > 1e8){
    float tf = (uY0 - o.y)/d.y;
    if (tf > 0.0 && tf < FAR_T*1.5){ scat += T*uFloorC; tFirst = min(tFirst, tf); T = 0.0; }
  }
  float al = 1.0 - T;
  vec3 cloud = vec3(0.0);
  if (al >= 0.002){
    // a cloud is not a light: held under the bloom threshold (uHold) on a soft knee, paling as it goes over
    vec3 cc = scat/al; float l = dot(cc, vec3(0.299, 0.587, 0.114));
    if (l > uHold - 0.08){ float k = (uHold - 0.08 + 0.08*(1.0 - exp(-(l - uHold + 0.08)/0.08)))/l; cc = mix(cc, vec3(l), 0.5*smoothstep(uHold - 0.08, uHold + 0.5, l))*k; }
    // far cloud melts into the sky behind it, right down to the horizon
    float hz = 1.0 - exp(-pow(min(tFirst, FAR_T*3.0)/uHaze, 1.6));
    cloud = mix(cc, back, hz)*al;
  }
  // the gates condensing out of the cloud, nearest first (gateSheet)
  {
    vec3 fS = vec3(0.0); float fT = 1.0;
    for (int k = 0; k < FORMING; k++){
      vec4 sh = gateSheet(uForm[k], o, d, tFirst, tScene);
      fS += fT*sh.a*sh.rgb; fT *= 1.0 - sh.a;
    }
    cloud = fS + fT*cloud; al = 1.0 - fT*(1.0 - al);
  }
  // the mist, in front of all that: steps that grow as it goes (near ones small and over fine wisps, far ones over banks of
  // it). Lit by the sky behind it, by her fire and by the lanterns. Where the sun has reached there is none: she comes out
  vec3 fogS = vec3(0.0); float fogT = 1.0;
  if (uFog > 0.0){
    // (a little jitter between pixels: the noise is smooth, and more than this reads as grain over the whole frame)
    float end = min(min(tScene, tFirst), uFarT), t0 = 0.0, g = pow(1.62, 0.4 + 0.2*jit);
    for (int k = 0; k < FOG_STEPS && t0 < end; k++){
      float t1 = min(3.0*(g - 1.0), end); g *= 1.62;
      if (k == FOG_STEPS - 1) t1 = end;   // the last goes all the way, on the banks' mean density
      float dt = t1 - t0, tm = t0 + dt*0.5;
      if (dt > 0.0){
        vec3 p = o + d*tm;
        float y = p.y, day = smoothstep(uFront - 280.0, uFront + 280.0, p.z);
        float rho = uFog*(uFogBase + 1.6*exp(-max(y - 1.0, 0.0)/3.2))*(1.0 - smoothstep(uFogTop*0.35, uFogTop, y))*(1.0 - day);
        if (rho > 1e-5){
          vec3 w = p + vec3(uDrift.x*1.6, sin(p.z/60.0)*2.0, uDrift.y*1.6);
          w.y = w.y*uFogRain.x + uFogRain.y;
          float n = k == FOG_STEPS - 1 ? 0.5 : clamp((textureLod(tNoise, w/(k < 5 ? 52.0 : 190.0), 0.0).r - 0.55)/0.21, 0.0, 1.0);
          rho *= 0.18 + 1.64*n*n*(3.0 - 2.0*n);
          float Ts = exp(-rho*dt);
          vec3 lum = back*uFogTint*(0.62 + 0.38*smoothstep(0.0, 36.0, y));
          vec3 fa = p - uFireA.xyz;
          lum += vec3(1.0, 0.40, 0.14)*uFireA.w*uFogFire*exp(-dot(fa, fa)/80.0);
          if (uLamp > 0.0){ vec2 q = vec2(p.x - pathX(p.z), p.y - pathY(p.z)); lum += vec3(1.0, 0.50, 0.20)*uLamp*uFogFire*0.7*lampAt(p, q); }
          if (uBolt.w > 0.0) lum += boltAt(p)*0.35;
          fogS += fogT*(1.0 - Ts)*lum;
          if (fogT > 0.2 && fogT*Ts <= 0.2) tOcc = min(tOcc, t0 + log(fogT/0.2)/rho);
          fogT *= Ts;
        }
      }
      t0 = t1;
    }
  }
  outOcc = vec4(1.0/(tOcc*max(-dv.z, 1e-4)));
  float a = 1.0 - fogT*(1.0 - al);
  if (a < 0.002){ outColor = vec4(0.0); return; }
  outColor = vec4(fogS + fogT*cloud, a);
}
