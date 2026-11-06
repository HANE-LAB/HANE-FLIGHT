#include <flight/torii>
attribute float aPart;
varying vec3 vC; varying vec3 vN; varying vec3 vW; varying vec3 vP; varying float vPart;
varying vec3 vGate;   // kind, lantern, day
varying float vQ;     // how far it has come
varying float vDate;  // what its plaque says
uniform float uTime; uniform float uWind; uniform float uSnow;
#if WRITING
attribute vec4 iD; attribute vec4 iE;
flat varying vec4 vWrit; flat varying vec4 vWrit2;   // what is written on its posts (src/writing.ts)
#endif
void main(){
  vec3 pos = position;
  // the paper flutters; it is hung from the rope, so the lower the more
  if (aPart > 11.5 && aPart < 12.5){ float d = max(0.61 - pos.y, 0.0)*(1.0 + 3.0*uWind), h = max(0.59 - pos.y, 0.0); pos.z += sin(uTime*7.0 + pos.x*60.0 + pos.y*30.0)*(d*0.22 + h*0.6*iG.z) + h*3.0*iG.x; pos.x += sin(uTime*5.0 + pos.x*40.0)*(d*0.08 + h*0.3*iG.z); }
  // the snow on the beams rises out of them as the cold goes on (how far up: its colour's red)
  if (aPart > 15.5) pos.y -= (1.0 - uSnow)*color.r*1.25;
  vec3 w = toriiPlace(pos);
  vQ = iC.x; vW = w; vP = position; vPart = aPart; vC = color; vN = toriiTurn(normal);
  vGate = vec3(iB.z, iC.y, iB.w); vDate = iB.y;
#if WRITING
  vWrit = iD; vWrit2 = iE;
#endif
  gl_Position = projectionMatrix*viewMatrix*vec4(w, 1.0);
  if (iC.x <= 0.0 || !toriiWears(aPart)) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
