// One layer of the cloud deck (src/clouds.ts bakes it once, at load): a tile of cumulus, flat-based and heaped. The weather
// (cloudtop.frag.glsl) says how high the cloud stands at each place; the shape is that heap's surface displaced by billows
// (Perlin-Worley and Worley, after Schneider's Horizon Zero Dawn clouds), then by a finer Worley: cauliflower higher up,
// wisps low down. Stored as a field rather than a density, 0 at the surface and growing inward, so at run time the surface
// can be drawn back anywhere (clouds.frag.glsl) and keeps its billows.
// (x, z) run over the tile and repeat; uW is the height, 0 … 1. The noise has a narrow range, so each read is stretched first.
uniform sampler3D tNoise; uniform sampler2D tTop; uniform float uW; uniform float uRatio; uniform float uHoverN;
varying vec2 vUv;
float sat(float x){ return clamp(x, 0.0, 1.0); }
float pw(float r){ return sat((r - 0.55)/0.21); }       // Perlin-Worley: 2nd to 98th percentile 0.57 … 0.74
float wf(vec4 n){ return sat((n.g*0.625 + n.b*0.25 + n.a*0.125 - 0.30)/0.40); }   // Worley fbm: about 0.32 … 0.68
void main(){
  float top = texture2D(tTop, vUv).r;
  float w3 = pw(texture(tNoise, vec3(vUv*5.0 + 0.11, 0.73)).r);
  float base = 0.07 + 0.05*w3;
  float macro = sat((top - uW)/clamp((top - base)*0.75, 0.05, 0.24))*sat((uW - base)/0.05);
  vec3 q = vec3(vUv*uRatio, uW*uHoverN);
  vec4 n = texture(tNoise, q);
  float bn = 0.50*pw(n.r) + 0.50*wf(n);
  float f = macro*1.35 - (1.0 - bn)*0.95;
  float en = wf(texture(tNoise, q*3.0 + 0.31));
  f -= mix(en, 1.0 - en, sat(uW*6.0))*0.22;
  gl_FragColor = vec4((f + 0.6)*0.5);   // -0.6 … 1.4 into 0 … 1
}
