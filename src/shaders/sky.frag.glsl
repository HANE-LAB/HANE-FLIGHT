#include <flight/sky>
uniform sampler2D tMW; uniform float uMW; uniform float uSunUp; uniform float uTime; uniform float uDawn;
uniform vec4 uMoonPh; uniform vec3 uMoonC;   // the moon: sin and cos of tonight's phase angle, how hazy it is (朧月), its radius; its colour
uniform float uHalo; uniform float uCorona;
// the Airy pattern, [2 J1(x)/x]^2, with J1 by Abramowitz & Stegun 9.4.4 and 9.4.6: diffraction by a droplet, by Babinet's principle the same as by a disc
float airy(float x){
  x = max(abs(x), 1e-3);
  float a;
  if (x <= 3.0){ float t = x*x/9.0; a = 2.0*(0.5 + t*(-0.56249985 + t*(0.21093573 + t*(-0.03954289 + t*(0.00443319 + t*(-0.00031761 + t*0.00001109)))))); }
  else { float t = 3.0/x, f = 0.79788456 + t*(0.00000156 + t*(0.01659667 + t*(0.00017105 + t*(-0.00249511 + t*(0.00113653 - t*0.00020033))))), p = x - 2.35619449 + t*(0.12499612 + t*(0.0000565 + t*(-0.00637879 + t*(0.00074348 + t*(0.00079824 - t*0.00029166))))); a = 2.0*f*cos(p)/(x*sqrt(x)); }
  return a*a;
}
varying vec3 vD;
float h12(vec2 p){ vec3 q = fract(vec3(p.xyx)*0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y)*q.z); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0 - 2.0*f); return mix(mix(h12(i), h12(i + vec2(1, 0)), f.x), mix(h12(i + vec2(0, 1)), h12(i + vec2(1, 1)), f.x), f.y); }
vec3 mwAt(vec3 d){ vec2 uv = vec2(atan(d.z, d.x)*0.15915494 + 0.5, asin(clamp(d.y, -1.0, 1.0))*0.31830989 + 0.5); return texture2D(tMW, uv).rgb; }
void main(){
  vec3 d = normalize(vD);
  vec3 col = skyColor(d);
  float clear = (1.0 - uInCloud)*smoothstep(-0.01, 0.06, d.y);
  col += mwAt(d)*uMW*clear;
  // the moon: a disc about four times its true size, in that night's real phase, with soft grey seas. Lit as a ball is: the
  // terminator curves across it, tipped a little as it is in the evening sky, and the dark part only just shows
  float cm = dot(d, uMoonDir);
  float mth = acos(clamp(cm, -1.0, 1.0));
  // 22° halo: light through hexagonal ice prisms (60° apex) bends at least 21.54° for red and 22.37° for blue, so the ring has a
  // sharp reddish inner edge, a fuzzy outer one, and it is darker inside
  if (uHalo > 0.0){
    vec3 at = vec3(0.3760, 0.3815, 0.3904);
    vec3 ring = smoothstep(at - 0.010, at, vec3(mth))*exp(-max(mth - 0.385, 0.0)/vec3(0.060, 0.050, 0.042));
    col *= 1.0 - 0.10*uHalo*clear*(1.0 - smoothstep(0.20, 0.375, mth));
    col += vec3(0.17, 0.19, 0.23)*ring*uHalo*clear;
  }
  // corona (月华): the same moon through thin cloud of near-equal droplets, an aureole and rings, blue inside and red outside. The
  // pattern's range is far too wide for the eye (its first ring is 1.75% of its middle), so it goes through a power, as the eye does
  if (uCorona > 0.0 && mth < 0.60){
    float x = 30.0*sin(mth);
    col += pow(vec3(airy(x*0.846), airy(x), airy(x*1.222)), vec3(0.35))*vec3(0.36, 0.30, 0.34)*uCorona*clear*(1.0 - smoothstep(0.42, 0.60, mth));
  }
  if (cm > 1.0 - 0.9*uMoonPh.w*uMoonPh.w){
    vec3 t1 = normalize(cross(uMoonDir, vec3(0.0, 1.0, 0.0))), t2 = cross(t1, uMoonDir);
    vec2 q = vec2(dot(d, t1), dot(d, t2))/uMoonPh.w;
    float r = length(q), z = sqrt(max(0.0, 1.0 - r*r)), disc = 1.0 - smoothstep(0.92 - 0.42*uMoonPh.z, 1.0 + 0.16*uMoonPh.z, r);
    float seas = smoothstep(0.45, 0.75, vn(q*2.3 + 3.1))*0.18 + smoothstep(0.55, 0.8, vn(q*5.0))*0.08;
    float lit = smoothstep(-0.02, 0.07, (q.x*0.90 + q.y*0.44)*uMoonPh.x + z*uMoonPh.y);
    vec3 face = mix(col + vec3(0.012, 0.015, 0.028), uMoonC*(1.0 - seas)*(0.92 + 0.08*z), lit);
    col = mix(col, face, disc*clear*(1.0 - 0.92*uDusk));
  }
  // the sun, once it is up, and the shafts of light fanning from it (crepuscular rays, painted into the sky); the rays
  // are sky, held under the bloom threshold with it, the disc is the light
  float cs = dot(d, uSunDir);
  if (uSunUp > 0.0){
    vec3 t1 = normalize(cross(uSunDir, vec3(0.0, 1.0, 0.0))), t2 = cross(t1, uSunDir);
    float ang = atan(dot(d, t2), dot(d, t1));
    float rays = pow(vn(vec2(ang*7.0, 0.5)), 3.0)*0.8 + pow(vn(vec2(ang*19.0, 4.0)), 4.0)*0.6;
    col += uSunGlowC*rays*0.35*smoothstep(0.80, 0.995, cs)*(1.0 - smoothstep(0.996, 0.9998, cs))*uSunUp*smoothstep(-0.02, 0.05, d.y);
    col = holdUnder(col);
    float disc = smoothstep(0.99962, 0.99975, cs);
    col = mix(col, vec3(1.45, 1.30, 1.05), disc*uSunUp);
  }
  gl_FragColor = vec4(col, 1.0);
}
