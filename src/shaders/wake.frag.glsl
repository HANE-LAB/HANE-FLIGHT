// The marks of rank and of long service (wake.vert.glsl), moving only smoothly. Colours are premultiplied, so what has no alpha is simply added, and a soft light can still be seen against a bright sky.
#include <flight/fire>
uniform float uTime; uniform float uDawn;
varying vec2 vC; varying float vT; varying float vI; varying float vYears; varying float vKind; varying float vHalo; varying float vSeed; varying vec3 vTint;
void main(){
  if (vI <= 0.0) discard;
  vec3 c = vec3(0.0); float al = 0.0;
  if (vKind > 0.5){
    float r = length(vC);
    if (r >= 1.0) discard;
    if (vHalo > 0.5){
      // a soft light of its own fire round a 总督 or a 提督: it has no edge, it is the bird's own light (a disc or a ring turned to the lens would read as a sticker)
      float glow = 1.0 - smoothstep(0.0, 1.0, r), k = vHalo > 1.5 ? 0.13 : 0.03;
      c = vTint*glow*glow*k;
      al = glow*glow*k*0.40;
    } else {
      // a star on one who has been with her a long time, its four rays turning very slowly; it breathes, it does not flash
      float ca = cos(vSeed*6.0 + uTime*0.05), sa = sin(vSeed*6.0 + uTime*0.05);
      vec2 p = vec2(ca*vC.x - sa*vC.y, sa*vC.x + ca*vC.y);
      float rayK = exp(-abs(p.x)*22.0)*exp(-abs(p.y)*3.6) + exp(-abs(p.y)*22.0)*exp(-abs(p.x)*3.6);
      float core = exp(-r*r*40.0);
      float breathe = 0.78 + 0.22*sin(uTime*1.1 + vSeed*40.0);
      c = vTint*(core + rayK*0.55)*breathe;
      al = core*0.35;
    }
    gl_FragColor = vec4(c*vI, al*vI);
    return;
  }
  float across = 1.0 - abs(vC.y), fade = pow(1.0 - vT, 1.7);
  // (a rank's wake is its own fire, a 舰长's the flock's)
  c = (vHalo > 0.5 ? vTint*mix(0.85, 0.30, vT) : fire(mix(0.92, 0.30, vT)*(1.0 - 0.3*uDawn)))*fade*smoothstep(0.0, 0.7, across)*vI;
  if (vYears > 0.5){
    float b = 0.5 + 0.5*cos(6.2832*(vT*vYears - uTime*0.16));
    c += fire(0.97)*pow(b, 18.0)*fade*across*vI*1.3;
  }
  // (added to a bright sky it only goes white: by day it is fainter)
  gl_FragColor = vec4(c*(1.0 - 0.62*uDawn), 0.0);
}
