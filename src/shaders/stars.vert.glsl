attribute float aMag; attribute vec3 aCol; uniform float uTime; uniform float uPR; uniform float uDusk; uniform float uInCloud; uniform float uTwinkle; uniform float uStarK;
varying vec3 vC; varying float vA; varying float vBig;
void main(){
  vec4 mv = modelViewMatrix*vec4(position, 1.0); gl_Position = projectionMatrix*mv;
  float alt = max(normalize(position).y, 0.0);
  // twinkling grows toward the horizon (more air), 0.5–3 Hz, frozen when motion is reduced
  float k = min(1.0/max(alt, 0.1), 6.0)*0.08;
  float h = fract(sin(dot(position.xz, vec2(12.9898, 78.233)))*43758.5453);
  float tw = 1.0 - k*(0.5 + 0.5*sin(uTime*(3.0 + 15.0*h) + h*40.0))*uTwinkle;
  float b = aMag*tw*smoothstep(0.0, 0.08, alt)*(1.0 - uDusk*smoothstep(0.0, 1.0, 1.2 - aMag))*(1.0 - uDusk*0.8)*(1.0 - uInCloud)*uStarK;
  vBig = smoothstep(0.6, 1.6, aMag);
  vA = min(b, 1.6); vC = aCol;
  gl_PointSize = (1.6 + 1.6*sqrt(min(aMag, 4.0)))*uPR*(1.0 + vBig*1.8);
  if (vA < 0.015) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
