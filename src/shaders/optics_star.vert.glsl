// The sun's star (src/optics.ts): one card over the frame, centred on the sun. Units: half the frame's height.
uniform vec2 uSun; uniform float uAspect; uniform float uAmt; uniform float uSize; uniform sampler2D tSeen;
varying vec2 vQ; varying float vA;
void main(){
  float seen = texture2D(tSeen, vec2(0.5)).r;
  vA = uAmt*seen;
  vQ = position.xy;
  vec2 p = uSun + position.xy*uSize;
  gl_Position = vA > 0.002 ? vec4(p.x/uAspect, p.y, 0.0, 1.0) : vec4(2.0, 2.0, 2.0, 1.0);
}
