// A fire feather she sheds (src/trail.ts, src/plume.ts), cooling as it falls
#include <flight/fire>
uniform sampler2D tPlume; uniform float uEmber;
varying vec2 vUv; varying float vL;
void main(){
  vec4 m = texture2D(tPlume, vUv);
  float a = m.r*smoothstep(0.0, 0.25, vL);
  if (a < 0.02) discard;
  vec3 c = fire(vUv.x*(1.0 - 0.6*uEmber))*(0.55 + 0.6*vL);
  c = mix(c, vec3(1.2, 1.05, 0.85), m.b*0.7);
  c = mix(c, vec3(0.05, 0.010, 0.006), m.g*0.6);
  gl_FragColor = vec4(c, a);
}
