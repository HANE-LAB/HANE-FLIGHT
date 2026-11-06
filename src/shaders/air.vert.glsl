// What is in the air (src/weather.ts): KIND 0 snow, 1 rain, 2 a petal. Fixed in a box of air that wraps round the lens, so there are
// always some about it. aS: where in the box, a seed. A lighter fall is fewer of them, not fainter ones.
//   Sizes as nature deals them, exponential: rain by Marshall & Palmer (1948), snow by Gunn & Marshall (1958). Rain falls at the
//   speed of its size (Atlas et al. 1973), so large drops streak longer, and each is as bright as it stays on a pixel (Garg & Nayar).
//   All of it is moved by the wind's closed form (src/wind.ts). Lights reach it by forward scattering (Henyey-Greenstein).
//   A petal falls as a card does: flutter or tumble by its Froude number (Belmonte et al. 1998), sliding toward its lower edge.
attribute vec4 aS;
uniform vec3 uBox; uniform vec3 uShift; uniform vec3 uVel; uniform float uFallT; uniform float uStreak; uniform float uAmount; uniform float uStir; uniform vec3 uWindU;
uniform vec4 uWindK[6]; uniform vec4 uWindA[6]; uniform vec4 uLamp[3]; uniform vec3 uLight;
uniform float uPx; uniform float uTime; uniform vec4 uBird; uniform vec4 uWake; uniform vec3 uCloudLit; uniform vec4 uFlash; uniform float uDawn;
varying vec2 vUv; varying float vA; varying vec3 vC; varying float vSeed; varying float vBig;
float phaseHG(float c, float g){ float g2 = g*g; return (1.0 - g2)/pow(max(1.0 + g2 - 2.0*g*c, 1e-3), 1.5)*0.08; }
// what the lanterns and her fire send toward the lens through this: rd the way from the lens, g how forward it scatters
vec3 lightsOn(vec3 p, vec3 rd, float g, float k){
  vec3 s = vec3(0.0);
  for (int i = 0; i < 3; i++){ vec3 l = p - uLamp[i].xyz; float d2 = dot(l, l); s += vec3(1.0, 0.60, 0.28)*uLamp[i].w*phaseHG(dot(l, rd)/sqrt(d2 + 1e-3), g)/(1.0 + d2/k); }
  vec3 f = p - uBird.xyz; float fd = dot(f, f);
  s += vec3(1.0, 0.50, 0.22)*1.4*phaseHG(dot(f, rd)/sqrt(fd + 1e-3), g)/(1.0 + fd/(0.5*k));
  return s;
}
// She parts the air, and no state here either. What comes at her goes round her as a stream round a ball the size of her wings: a dipole, pushed out from her line by a³/2R³. What has gone
// by goes through the curl off each wing tip (shaped as Kaufmann's vortex, also called Scully's: solid in its core), up on the outside and down on the inside: turned by an arc that is largest in the core, some 47° there
// and about 32 m behind her, so a flake drifting back through it is carried aside a metre or so, and goes on falling.
vec3 parted(vec3 p){
  float b = uWake.w;
  if (b <= 0.0) return p;
  vec3 r = p - uBird.xyz;
  float along = dot(r, uWake.xyz), R2 = dot(r, r) + 1.0;
  vec3 rr = r - uWake.xyz*along;
  float k = 0.5*b*b*b/(R2*sqrt(R2));
  p += rr*k/(1.0 + k);
  if (along >= 0.0) return p;
  vec3 right = normalize(vec3(uWake.z, 0.0, -uWake.x));
  float x = dot(rr, right), tip = x < 0.0 ? -0.8*b : 0.8*b, dx = x - tip, dy = rr.y;
  float turn = (x < 0.0 ? -1.0 : 1.0)*0.07*(-along)*exp(along/32.0)/(1.0 + (dx*dx + dy*dy)/(0.5*b*b));
  float c = cos(turn), s = sin(turn);
  // (across the line the two curls cancel, as they do in the air: each only answers for its own side)
  return p + right*(dx*c - dy*s - dx)*smoothstep(0.0, 0.8*b, abs(x)) + vec3(0.0, dx*s + dy*c - dy, 0.0);
}
void main(){
  gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vUv = vec2(0.0); vA = 0.0; vC = vec3(0.0); vSeed = aS.w; vBig = 0.0;
  if (aS.w > uAmount) return;
  float xi = fract(aS.w*37.7);
#if KIND == 0
  float D = min(3.2, -log(1.0 - xi*0.98)*0.60), v = 0.72 + 0.34*pow(D, 0.31);                       // size (melted, as Gunn & Marshall's is); fall speed, ~ D^0.31 for that D (Langleben 1954)
#elif KIND == 1
  float D = min(5.0, 0.3 - log(1.0 - xi*0.98)/2.0), v = max(9.65 - 10.3*exp(-0.6*D), 1.0)/6.5;      // mm; m/s, against a 2 mm drop's
#else
  float v = 0.75 + 0.5*xi;
#endif
  vec3 ahead = vec3(0.0, 0.0, 0.30*uBox.z);   // (most of the box is in front of the lens)
  vec3 rel = mod(aS.xyz*uBox + uShift + vec3(0.0, uFallT*v, 0.0) - cameraPosition - ahead + uBox*0.5, uBox) - uBox*0.5 + ahead;
  vec3 p0 = cameraPosition + rel;
  // the eddies, drifting with the mean wind
  vec3 X = p0 - uWindU*uTime, stir = vec3(0.0);
  for (int i = 0; i < 6; i++) stir += uWindA[i].xyz*sin(dot(uWindK[i].xyz, X) + uWindK[i].w - uWindA[i].w*uTime);
  vec3 p = parted(p0 + stir*uStir);
#if KIND == 2
  // a card falling (after Tanabe & Kaneko's falling paper; the sine is this page's own): it swings at its pendulum's rate, tilted the way it is sliding,
  // and rises a little at each end of the swing. Past the critical Froude number it tumbles instead
  float fr = fract(aS.w*91.3), om = 1.6 + 2.2*fract(aS.w*11.9), ph = om*uTime + aS.x*40.0, yaw = aS.y*40.0 + 0.15*uTime;
  vec3 swing = vec3(cos(yaw), 0.0, sin(yaw)), across3 = vec3(-swing.z, 0.0, swing.x);
  bool tumbles = fr > 0.78;
  float tilt = tumbles ? ph : 0.9*cos(ph);
  if (!tumbles) p += swing*1.15*sin(ph) + vec3(0.0, 0.35*cos(2.0*ph), 0.0);
  vec3 e1 = swing*cos(tilt) + vec3(0.0, sin(tilt), 0.0), n3 = cross(across3, e1);
#endif
  vec3 d = p - cameraPosition;
  float t = length(d), a = smoothstep(2.5, 7.0, t)*(1.0 - smoothstep(0.34*uBox.z, 0.56*uBox.z, t));
  if (a <= 0.004) return;
  vec3 rd = d/t;
  mat4 pv = projectionMatrix*viewMatrix;
  float P = projectionMatrix[1][1];
#if KIND == 2
  float half_ = (0.20 + 0.14*aS.y)*max(1.0, t*1.8/(0.30*uPx/1.0));   // (never under a couple of pixels)
  half_ = min(half_, 22.0*t/uPx);
  vec3 w = p + (e1*position.y*2.0 + across3*position.x*1.4)*half_;
  // thin: lit from either side, the light coming through it on the far side a little warmer. Its own pink, then the lights
  float nl = dot(n3, uLight), view = dot(n3, rd), through = nl*view > 0.0 ? 1.0 : 0.0;
  vec3 base = mix(vec3(0.60, 0.20, 0.32), vec3(0.92, 0.46, 0.56), aS.x);
  vC = base*(0.46 + 0.62*abs(nl)*mix(0.72, 1.12, through) + 0.85*uDawn) + lightsOn(p, rd, 0.5, 90.0)*vec3(1.0, 0.62, 0.62);
  vA = a; vUv = position.xy + 0.5;
  gl_Position = pv*vec4(w, 1.0);
#else
  vec3 vel = uVel + vec3(0.0, -uStreak*v, 0.0);
  vec4 ca = pv*vec4(p, 1.0), cb = pv*vec4(p + vel, 1.0);
  if (ca.w < 0.6 || cb.w < 0.6) return;
  vec2 asp = vec2(P/projectionMatrix[0][0], 1.0), sa = ca.xy/ca.w*asp, dir = cb.xy/cb.w*asp - sa;
  float len = length(dir), least = 1.2*P/uPx;
  vec2 along = len > 1e-4 ? dir/len : vec2(0.0, 1.0), across = vec2(-along.y, along.x);
#if KIND == 0
  float size = min((0.055 + 0.075*D)*P/ca.w, 14.0*P/uPx), w = max(size, least);   // half its width, on the screen
  vec2 s = sa + dir*(position.y + 0.5) + (across*position.x + along*position.y)*2.0*w;
  vA = a*min(1.0, 0.4 + size/least)*w/(w + 0.5*len);
  vBig = smoothstep(4.0, 9.0, size/(P/uPx))*(1.0 - smoothstep(0.1, 0.6, len/(w + 1e-4)));   // near and hardly moving, it shows its six arms
  // the sky's light, more where the moon is behind it; the lights near it through forward scattering
  vC = uCloudLit*(1.25 + 0.5*phaseHG(dot(uLight, rd), 0.6)) + lightsOn(p, rd, 0.6, 60.0);
#else
  float w = max((0.010 + 0.006*D)*P/ca.w, 0.8*P/uPx);
  vec2 s = sa + dir*(position.y + 0.5) + across*position.x*2.0*w;
  // as bright as it stays on a pixel: a large drop is wider and slower for its size
  vA = a*clamp(0.18 + 0.15*D/v, 0.0, 0.72);
  // what a drop refracts is most of the sky at once, so it is about as bright against anything; then the lightning and the lights
  vC = uCloudLit*1.35 + vec3(0.62, 0.72, 1.0)*(0.20 + 1.6*uFlash.w) + lightsOn(p, rd, 0.85, 80.0);
#endif
  vUv = position.xy + 0.5;
  gl_Position = vec4(s/asp*ca.w, ca.z, ca.w);
#endif
}
