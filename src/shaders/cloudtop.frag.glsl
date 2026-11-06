// The weather of the cloud deck, in plan (src/clouds.ts bakes it once): how high the cloud stands at each place. Cumulus are
// heaps, so this is heaps: on a jittered grid, domes of every size, many small and a few great towers, standing on an unbroken
// floor of cloud, its top nearly level: the sea the gates come up out of. It repeats with the tile.
uniform sampler3D tNoise;
varying vec2 vUv;
vec3 h32(vec2 p){ vec3 q = fract(vec3(p.xyx)*vec3(0.1031, 0.1030, 0.0973)); q += dot(q, q.yxz + 33.33); return fract((q.xxy + q.yzz)*q.zyx); }
const float G = 9.0;
void main(){
  vec2 p = vUv*G, i = floor(p), f = fract(p);
  float top = 0.0;
  for (int y = -2; y <= 2; y++) for (int x = -2; x <= 2; x++){
    vec2 o = vec2(x, y), c = mod(i + o, G);
    vec3 r = h32(c + 17.0), s = h32(c*1.7 + 41.0);
    vec2 d = o + 0.15 + 0.7*r.xy - f;
    // height: mostly low, a few standing tall; the tall ones broader
    float hgt = 0.26 + 0.74*pow(r.z, 1.9), rad = mix(0.55, 1.05, s.x) + 0.75*hgt;
    float d2 = dot(d, d)/(rad*rad);
    if (d2 < 1.0) top = max(top, hgt*pow(1.0 - d2, 0.42));   // a dome, steep at its rim
  }
  // the floor between them, rolling a little
  float w = clamp((texture(tNoise, vec3(vUv*2.0 + 0.37, 0.41)).r - 0.55)/0.21, 0.0, 1.0);
  top = max(top, 0.155 + 0.03*w);
  gl_FragColor = vec4(top, top, top, 1.0);
}
