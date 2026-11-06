// One small bird of her flock, a 舰长 (src/flock.ts, the model kan: the far ones, which are never more than a shape). iF: where it flies.
#include <flight/flock>
#define BIGGER 0.45
attribute vec4 iF;
uniform float uN; uniform float uBase;
varying float vU; varying float vShade;
void main(){
  float rank = uBase + float(gl_InstanceID);
  // the newest fade up out of the cloud from below to join her; those leaving sink away the same way
  float born = clamp((uN - rank)/(uN*0.05 + 3.0), 0.0, 1.0);
  gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vU = uv.x; vShade = 1.0;
  if (born <= 0.0) return;
  float b = born*born*(3.0 - 2.0*born), seed = iF.w;
  Place P = flockPlace(kanRest(iF), flockOut(rank), 0.0, 0.0);
  vec3 pos = P.pos;
  pos.y -= (1.0 - b)*(36.0 + 90.0*fract(seed*5.1));
  float size = 0.78*(1.0 + BIGGER*uRest)*(0.8 + 0.5*fract(seed*13.7))*smoothstep(0.0, 0.25, born);
  // at least about two pixels across: thinner, a far bird would blink as it moves between them
  float dCam = max(length(pos - cameraPosition), 0.5), big = clamp(1.0*dCam/uPx/max(size, 0.05), 1.0, 7.0);
  size *= smoothstep(mix(2.0, 1.0, uRest), mix(12.0, 4.0, uRest), dCam);   // one that passes the lens shrinks away rather than crossing it as a streak
  size *= big;
  // the wing: its beat quick and each bird's own, the hand coming after the arm, swept back on the way up
  float a = uTime*(10.0 + 5.0*fract(seed*3.1)) + seed*60.0, e1 = sin(a)*0.56 + 0.20, e2 = sin(a - 0.8)*0.42;
  pos += flapped(position, 0.46, e1, e2, max(0.0, cos(a)), 0.22 + 0.45*uRest, P)*size;
  // a wing turned edge-on reads darker, so the flock shimmers as it beats; and no two quite the same fire, or so many run together into one flat colour
  vShade = (0.72 + 0.28*abs(cos(e1)))*(0.88 + 0.24*fract(seed*23.1));
  vU = uv.x*(0.86 + 0.28*fract(seed*41.7));
  gl_Position = projectionMatrix*viewMatrix*vec4(pos, 1.0);
}
