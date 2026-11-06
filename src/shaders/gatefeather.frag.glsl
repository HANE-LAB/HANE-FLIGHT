// The pair of fire feathers on a special night's gate (src/plume.ts): their own light, vermilion at the root to gold at
// the tip (the tips cross the bloom threshold, so the big nights glow along the line from far off)
#include <flight/scene>
#include <flight/fire>
uniform sampler2D tPlume;
varying vec2 vUv; varying vec3 vW; varying float vIg;
void main(){
  vec4 m = texture2D(tPlume, vUv);
  if (m.r < 0.02) discard;
  vec3 c = fire(vUv.x*(1.0 - 0.45*uDawn));
  c = mix(c, c*1.35 + vec3(0.10, 0.07, 0.03), m.a*0.45);
  c = mix(c, vec3(1.3, 1.15, 0.9), m.b*0.85);
  c = mix(c, vec3(0.05, 0.010, 0.006), m.g*0.7);
  gl_FragColor = vec4(hazeLight(c*(1.0 + 1.2*(1.0 - vIg)), vW), m.r*gateAlpha(vW)*smoothstep(1.0 - vIg*1.15, 1.15 - vIg*1.15, 1.0 - vUv.x));
}
