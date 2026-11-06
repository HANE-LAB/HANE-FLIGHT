// One layer of the clouds' tileable 3D noise (src/clouds.ts renders all 64): R Perlin-Worley (the billows' base,
// after Schneider's Horizon Zero Dawn clouds), G B A Worley fbm at 2, 4 and 8 times its frequency (to erode the edges).
uniform float uZ; uniform float uN; varying vec2 vUv;
vec3 hash33(vec3 p){ p = fract(p*vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx)*p.zyx); }
// gradient noise that tiles with period P (cells)
float gnoise(vec3 p, float P){
  vec3 i = floor(p), f = fract(p), u = f*f*f*(f*(f*6.0 - 15.0) + 10.0);
  float r = 0.0;
  float n000, n100, n010, n110, n001, n101, n011, n111;
  #define G(o) dot(hash33(mod(i + o, P))*2.0 - 1.0, f - o)
  n000 = G(vec3(0, 0, 0)); n100 = G(vec3(1, 0, 0)); n010 = G(vec3(0, 1, 0)); n110 = G(vec3(1, 1, 0));
  n001 = G(vec3(0, 0, 1)); n101 = G(vec3(1, 0, 1)); n011 = G(vec3(0, 1, 1)); n111 = G(vec3(1, 1, 1));
  r = mix(mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y), mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y), u.z);
  return r;
}
// cellular noise (distance to the nearest feature point), tiling with period P, inverted: 1 at a point, 0 far from all
float worley(vec3 p, float P){
  vec3 i = floor(p), f = fract(p); float d = 1e9;
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++){
    vec3 o = vec3(x, y, z), c = hash33(mod(i + o, P));
    vec3 v = o + c - f; d = min(d, dot(v, v));
  }
  return 1.0 - clamp(sqrt(d), 0.0, 1.0);
}
float worleyFbm(vec3 p, float P){ return worley(p, P)*0.625 + worley(p*2.0, P*2.0)*0.25 + worley(p*4.0, P*4.0)*0.125; }
float remap(float v, float a, float b, float c, float d){ return c + (v - a)/(b - a)*(d - c); }
void main(){
  vec3 p = vec3(vUv, (uZ + 0.5)/uN);
  float pf = 0.0, amp = 1.0, fr = 4.0, tot = 0.0;
  for (int o = 0; o < 5; o++){ pf += amp*gnoise(p*fr, fr); tot += amp; amp *= 0.5; fr *= 2.0; }
  pf = pf/tot*0.5 + 0.5;
  float w = worleyFbm(p*4.0, 4.0);
  float pw = clamp(remap(pf, w - 1.0, 1.0, 0.0, 1.0), 0.0, 1.0);   // Perlin-Worley: perlin's spread with worley's billows
  gl_FragColor = vec4(pw, worleyFbm(p*8.0, 8.0), worleyFbm(p*16.0, 16.0), worleyFbm(p*32.0, 32.0));
}
