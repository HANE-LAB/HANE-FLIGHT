// The glow round each burning lantern: a camera-facing card, a little larger than the lantern, and never under 3 px
#include <flight/torii>
uniform float uPx; uniform float uTime; uniform float uWind;
varying vec2 vUv; varying float vA; varying vec3 vW;
void main(){
  vec3 c = toriiPlace(lanternSwing(vec3(0.0, 0.515, 0.0), uTime, uWind));
  float d = max(length(c - cameraPosition), 0.1);
  float r = max(iB.x*0.22, 3.0*d/uPx);
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]), up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 w = c + (right*position.x + up*position.y)*r;
  vUv = position.xy*0.5 + 0.5; vA = iC.y*min(1.0, iB.x*0.22/r*1.6)*smoothstep(5.0, 22.0, d); vW = c;   // (going out as it nears the lens: a glow is not a veil over the frame)
  gl_Position = projectionMatrix*viewMatrix*vec4(w, 1.0);
  if (iC.y < 0.01 || iC.x < 0.45) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
