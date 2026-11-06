// The aperture again, as a ghost: six blades, turned as in src/optics.ts, a little brighter at its rim (what spherical aberration does); cut off on one side by the rest of the lens as the sun goes off
// the axis. Each colour at its own place and size, which is the fringe on its edge.
uniform vec2 uSun; uniform vec3 uTint;
varying vec2 vQ; varying vec3 vK; varying vec3 vR; varying vec3 vE;
const vec2 N0 = vec2(0.7084, 0.7058), N1 = vec2(-0.2571, 0.9664), N2 = vec2(-0.9655, 0.2606);   // (the blades' normals: 30°, 90°, 150°, plus the aperture's turn of 0.26 rad)
float ghost(float k, float r){
  vec2 p = (vQ - uSun*k)/r;
  float d = max(abs(dot(p, N0)), max(abs(dot(p, N1)), abs(dot(p, N2)))) - 1.0;
  // (soft by its size: a large ghost is out of focus)
  float e = 0.04 + 0.05*r;
  float f = 1.0 - smoothstep(-e, e, d);
  f *= 0.62 + 0.38*smoothstep(-0.30, -0.02, d);
  // the lens's own barrel: seen through from off the axis, two circles' overlap, the cat's eye
  f *= 1.0 - smoothstep(1.06 - e, 1.06 + e, length(p + uSun*0.42));
  return f;
}
void main(){
  vec3 c = vec3(ghost(vK.r, vR.r), ghost(vK.g, vR.g), ghost(vK.b, vR.b));
  gl_FragColor = vec4(c*vE*uTint*0.55, 1.0);
}
