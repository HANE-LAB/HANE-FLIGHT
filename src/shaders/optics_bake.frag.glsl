// The aperture's far field (src/optics.ts) over the spectrum: a pattern scales with the wavelength, so each wavelength is the one picture at its own size, and its own colour.
// All kept as fourth roots: the light in the picture spans ten orders of magnitude.
uniform sampler2D tMono; uniform float uScale[24]; uniform vec3 uWeight[24];
varying vec2 vUv;
void main(){
  vec3 c = vec3(0.0);
  vec2 q = vUv - 0.5;
  for (int i = 0; i < 24; i++){
    vec2 uv = q*uScale[i] + 0.5;
    float t = (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) ? texture2D(tMono, uv).r : 0.0, t2 = t*t;
    c += uWeight[i]*t2*t2*uScale[i]*uScale[i];
  }
  gl_FragColor = vec4(sqrt(sqrt(max(c, 0.0))), 1.0);
}
