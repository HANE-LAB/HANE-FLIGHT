#include <flight/torii>
attribute float aPart; attribute vec3 aOutN; uniform float uLineW; uniform float uPx;
varying vec3 vW; varying vec3 vLine;
void main(){
  vec3 w = toriiPlace(position);
  float d = max(length(w - cameraPosition), 0.1);
  // lines only on gates taller than about 60 px on screen, thinning in before that (a one-pixel line on a far gate crawls)
  float k = smoothstep(60.0, 120.0, uPx*iB.x/d)*smoothstep(0.72, 1.0, iC.x);   // (and once the fire has run along it)
  w += (toriiTurn(aOutN) + normalize(w - cameraPosition)*1.5)*(uLineW*1.05*d/uPx)*k;
  vW = w;
  // the line takes a dark shade of what it outlines: vermilion or wood or gilt
  vLine = aPart > 0.5 && aPart < 1.5 || aPart > 6.5 && aPart < 8.5 ? vec3(0.030, 0.026, 0.040) : plainWood() ? vec3(0.070, 0.045, 0.020) : aPart > 8.5 && aPart < 10.5 ? vec3(0.085, 0.045, 0.012) : vec3(0.090, 0.018, 0.022);
  gl_Position = projectionMatrix*viewMatrix*vec4(w, 1.0);
  if (k <= 0.001 || !toriiWears(aPart)) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
