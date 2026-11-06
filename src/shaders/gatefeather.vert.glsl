// 火羽 on a special night's gate (src/gates.ts): a feather in gate units, placed with its gate. Its quill stays in its socket on
// the top beam; the rest stirs in the wind, more toward the tip.
#include <flight/torii>
uniform float uTime;
varying vec2 vUv; varying vec3 vW; varying float vIg;
void main(){
  vUv = uv;
  vec3 p = position; float u2 = uv.x*uv.x, side = p.x < 0.0 ? -1.0 : 1.0;
  // (and it streams and shakes as she goes under)
  float a = iB.w*2.1 + side, b = iB.w*1.3 + side*0.7;
  p.x += (sin(uTime*1.7 + a) + 3.5*iG.z*sin(uTime*5.7 + a))*0.012*u2;
  p.z += (sin(uTime*2.3 + b) + 3.5*iG.z*sin(uTime*7.3 + b))*0.018*u2 + 0.05*iG.z*u2;
  vec3 w = toriiPlace(p);
  vW = w;
  vIg = smoothstep(0.72, 0.98, iC.x);   // they catch when the fire reaches the middle of the top beam, from the quill up
  gl_Position = projectionMatrix*viewMatrix*vec4(w, 1.0);
  // only on the gates of the big nights (kind 2)
  if (iB.z < 1.5 || vIg <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
