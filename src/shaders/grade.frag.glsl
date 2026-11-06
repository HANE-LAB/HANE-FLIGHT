// The last pass (src/post.ts): the glow, Voyage's tone curve, vignette, the 二次元 LUT and grain.
uniform sampler2D tDiffuse; uniform sampler2D tBloom; uniform sampler3D tLut;
uniform float uTime; uniform vec2 uRes;
uniform sampler2D tFrost; uniform float uFrost;
uniform sampler2D tGlass; uniform float uGlass;   // what the sun does in the lens (src/optics.ts)
varying vec2 vUv;
vec3 aces(vec3 x){ return clamp((x*(2.51*x + 0.03))/(x*(2.43*x + 0.59) + 0.14), 0.0, 1.0); }
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)))*43758.5453); }
void main(){
  vec4 b = texture2D(tBloom, vUv);   // the glow, added as r128's blend did: rgb x alpha
  vec3 lit = texture2D(tDiffuse, vUv).rgb + b.rgb*b.a;
  if (uGlass > 0.5) lit += texture2D(tGlass, vUv).rgb;
  vec3 c = aces(lit);
  vec2 q = vUv - 0.5; q.x *= uRes.x/uRes.y;
  c *= 1.0 - 0.34*smoothstep(0.35, 1.05, length(q));
  c = texture(tLut, sqrt(max(c, 0.0))*(32.0/33.0) + 0.5/33.0).rgb;
  // frost on the lens: real dendrites (dev/frost.mjs), a picture of when the ice reached each point, so it grows and melts along its own
  // arms by a threshold. That time is also a height: each arm froze first along its axis, so its slope lights it like relief
  if (uFrost > 0.0){
    vec2 fq = uRes.x >= uRes.y ? vUv : vUv.yx;
    float t = texture2D(tFrost, vec2(fq.x, 1.0 - fq.y)).r, a = smoothstep(uFrost, uFrost - 0.02, t);
    if (a > 0.0){
      float slope = dFdx(t)*0.7 - dFdy(t)*0.7, young = smoothstep(uFrost - 0.16, uFrost, t);
      vec3 ice = mix(vec3(0.16, 0.22, 0.32), vec3(0.66, 0.74, 0.86), clamp(0.18 + 0.82*young + slope*30.0, 0.0, 1.0));
      c = mix(c, 1.0 - (1.0 - c)*(1.0 - ice), a*0.75);   // (screened over the scene, which shows through it)
    }
  }
  c += (hash(vUv*uRes + fract(uTime)*97.0) - 0.5)*0.010;
  gl_FragColor = vec4(c, 1.0);
}
