// A wisp of the mist she flies through (src/spill.ts): soft cards fixed in the world along the line, so they rush past the lens
// and past her; they are what says she is inside the cloud. aW: which one, three seeds. Its place follows from how far she has
// flown (each comes round again when it is far behind), so a seek or a pause gives the same picture.
#include <flight/path>
attribute vec4 aW;
uniform float uS; uniform float uSpan; uniform float uWisp; uniform float uKeep; uniform float uFogK;
#include <flight/sky>
varying vec2 vUv; varying float vA; varying vec3 vBack; varying float vHaze; varying float vSeed;
void main(){
  gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vUv = vec2(0.0); vA = 0.0; vBack = vec3(0.0); vHaze = 1.0; vSeed = aW.y;
  if (aW.w > uKeep || uWisp <= 0.0) return;
  float z0 = uS - 40.0, z = z0 + mod(aW.x*uSpan - z0, uSpan);
  float side = aW.y < 0.5 ? -1.0 : 1.0, out_ = fract(aW.y*2.0);
  // mostly low and to the sides, some across the line above the lanterns, where she flies under them
  float off = 5.0 + 44.0*out_*out_;
  vec3 p = vec3(pathX(z) + side*off, 1.0 + 44.0*aW.z*aW.z + 16.0*(1.0 - smoothstep(6.0, 14.0, off)), z);
  vec3 rd = p - cameraPosition; float t = length(rd);
  float a = uWisp*(0.15 + 0.20*aW.w)*(1.0 - smoothstep(120.0, 210.0, t))*smoothstep(3.0, 15.0, t);
  if (a <= 0.003) return;
  float r = 6.0 + 12.0*aW.z;
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]), up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 w = p + right*position.x*r*2.6 + up*position.y*r*1.2;
  vUv = position.xy + 0.5;
  vA = a;
  vBack = skyColor(normalize(vec3(rd.x, max(rd.y, 0.015*t), rd.z)));
  vHaze = exp(-uFogK*300.0*log(1.0 + t/300.0));
  gl_Position = projectionMatrix*viewMatrix*vec4(w, 1.0);
}
