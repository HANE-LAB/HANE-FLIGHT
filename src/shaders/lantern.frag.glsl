#include <flight/scene>
varying vec3 vW; varying vec3 vN; varying float vBlack; varying float vLit; varying float vY;
void main(){
  vec3 n = normalize(vN);
  // unlit: off-white paper in the night's two tones; lit: glowing from inside, brightest at the belly, above the bloom
  // threshold so it blooms (a lantern is a light, the one thing allowed to cross it)
  float side = keyLit(n);
  vec3 paper = mix(vec3(0.20, 0.19, 0.22), vec3(0.42, 0.40, 0.42), side);
  float belly = 1.0 - 0.45*abs(vY)/1.2;
  vec3 glow = vec3(1.20, 0.50, 0.17)*vLit*belly*1.05;
  vec3 col = mix(paper + glow, vec3(0.05, 0.04, 0.045) + vec3(0.25, 0.10, 0.03)*vLit, vBlack);
  // the ribs of the paper
  float rib = 1.0 - smoothstep(0.0, fwidth(vY)*1.5, abs(fract(vY*4.0) - 0.5)*2.0 - 0.9);
  col *= 1.0 - 0.25*rib*(1.0 - vBlack);
  gl_FragColor = vec4(hazeLight(col, vW), gateAlpha(vW));
}
