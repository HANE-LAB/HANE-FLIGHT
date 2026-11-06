// A ghost (src/optics.ts): a small card round where this pair of surfaces lands the sun. Units: half the frame's height. iK: where, as a multiple of where the sun is; iR: its radius over the focal
// length; iE: how much light. Red, green and blue each.
attribute vec3 iK; attribute vec3 iR; attribute vec3 iE;
uniform vec2 uSun; uniform float uAspect; uniform float uAmt; uniform float uScale; uniform sampler2D tSeen;
varying vec2 vQ; varying vec3 vK; varying vec3 vR; varying vec3 vE;
void main(){
  float seen = texture2D(tSeen, vec2(0.5)).r;
  // (with the sun on the axis they all stack up on it, a milky disc over the gate it stands in: they come in as it leaves. By its angle: how far apart they are against how big they are does not depend on the lens)
  vK = iK; vR = iR*uScale; vE = iE*uAmt*seen*smoothstep(0.04, 0.22, length(uSun)/uScale);
  float R = max(vR.r, max(vR.g, vR.b))*1.2;
  vec2 q = uSun*iK.g + position.xy*(R + length(uSun)*abs(iK.g - iK.r)*2.0);
  vQ = q;
  gl_Position = vE.g > 0.0005 ? vec4(q.x/uAspect, q.y, 0.0, 1.0) : vec4(2.0, 2.0, 2.0, 1.0);
}
