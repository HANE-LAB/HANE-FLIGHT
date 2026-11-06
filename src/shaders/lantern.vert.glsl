// A paper lantern (提灯) hanging under each gate's tie beam (src/gates.ts); lantern units: radius 1, height ±1.3
#include <flight/torii>
attribute float aBlack;
uniform float uTime; uniform float uWind;
varying vec3 vW; varying vec3 vN; varying float vBlack; varying float vLit; varying float vY;
const float LANTERN_Y = 0.515, LANTERN_R = 0.046;   // in gate units; the same 0.515 is written in glow.vert, torii.frag, clouds.frag, gates.ts, weather.ts
void main(){
  vec3 pos = position*LANTERN_R + vec3(0.0, LANTERN_Y, 0.0);
  vec3 w = toriiPlace(lanternSwing(pos, uTime, uWind));
  vW = w; vN = toriiTurn(lanternSwing(normal + vec3(0.0, 0.655, 0.0), uTime, uWind) - vec3(0.0, 0.655, 0.0)); vBlack = aBlack; vLit = iC.y; vY = position.y;
  gl_Position = projectionMatrix*viewMatrix*vec4(w, 1.0);
  if (iC.x < 0.45 || iC.y < 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);   // it takes shape as it catches; none on the last gate
}
