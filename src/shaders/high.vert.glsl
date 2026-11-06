// A small bird in feathers (src/flock.ts): the 舰长 nearer her (the models kan1 and kan0), a 提督 (tei) or a 总督 (sou), each a small copy of her.
// iF: where it flies. iH: half a wingspan (m), days with her on the last day, its rank among the 舰长 (-1: a 提督 or 总督).
#define ROUND_POSTS
#include <flight/flock>
#define BIGGER 0.45
#ifndef USE_UV1
attribute vec2 uv1;
#endif
attribute vec4 iF; attribute vec3 iH;
uniform float uN;
varying vec2 vUv; varying vec2 vAux; varying float vSolid; varying float vShade; varying float vOld; varying float vRim;
void main(){
  bool kan = iH.z >= 0.0;
  float a = iH.y - uAgo;
  float born = kan ? clamp((uN - iH.z)/(uN*0.05 + 3.0), 0.0, 1.0) : smoothstep(-3.0, 3.0, a);
  gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vUv = uv; vAux = uv1; vSolid = 0.0; vShade = 1.0; vOld = 0.0; vRim = 0.0;
  if (born <= 0.0) return;
  float b = born*born*(3.0 - 2.0*born), seed = iF.w;
  bool sou = iH.z < -1.5;
  Place P = flockPlace(sou ? souUp(iF, -2.0 - iH.z) : (kan ? kanRest(iF) : iF), kan ? flockOut(iH.z) : (sou ? souOut(-2.0 - iH.z) : 12.0), kan ? 0.0 : (sou ? 9.0 : 3.0), kan ? 0.9 : (sou ? 3.4 : 1.9));
  vec3 pos = P.pos;
  pos.y -= (1.0 - b)*(36.0 + 90.0*fract(seed*5.1));
  vec3 t = kan ? tiersOf(a) : vec3(0.0);
  vOld = 0.45*t.x + 0.30*t.y + 0.25*t.z;
  float size = iH.x*(1.0 + BIGGER*uRest)*(kan ? (0.8 + 0.5*fract(seed*13.7))*(1.0 + 0.18*(t.x + t.y + t.z)*(1.0 - uRest))*smoothstep(0.0, 0.25, born) : 1.0);
  float dCam = max(length(pos - cameraPosition), 0.5), big = kan ? clamp(1.0*dCam/uPx/max(size, 0.05), 1.0, 7.0) : 1.0;
  size *= smoothstep(mix(2.0, 1.0, uRest), mix(12.0, 4.0, uRest), dCam);
  // (once it is only a few pixels, the whole feather burns, or its shape would blink)
  vSolid = smoothstep(1.0, 1.8, 3.0*dCam/uPx/max(size, 0.05));
  size *= big;
  // the tail streams and waves, more toward its end. Those longest with her have grown a long one, as she has: a tail is how long you have been here
  vec3 q = position;
  float d = max(0.0, -q.z - 0.22), years = max(0.0, floor(a/365.0));
  float longer = 1.0 + 0.9*t.x + 1.1*t.y + 1.5*t.z + 0.35*min(years, 5.0)*t.z;
  // (waiting at today they are packed close and large: tails that long would hang together in a mass)
  longer = 1.0 + (longer - 1.0)*(1.0 - 0.55*uRest);
  // (the same number of waves along it however long it has grown, or they would be too short for its joints and it would zigzag; and a long one a little wider, or it is a thread)
  q.x *= 1.0 + 0.30*(longer - 1.0)*smoothstep(0.0, 0.2, d);
  float w = min(d*d, 0.6 + 1.6*d)*longer;
  q.z -= d*(longer - 1.0);
  q.x += sin(uTime*2.7 - d*2.6 + seed*9.0)*0.09*w;
  q.y += sin(uTime*2.1 - d*2.2 + seed*5.0)*0.10*w - 0.05*w;
  // the higher ranks beat slower, as she does; the 舰长 nearer her a little less quick than those far out, whose beat is only a shimmer
  float e = uTime*(kan ? 7.2 + 3.0*fract(seed*3.1) : 5.2 + 1.6*fract(seed*3.1)) + seed*60.0, e1 = mix(sin(e)*0.52 + 0.19, 0.95 + 0.12*sin(e), P.tuck), e2 = mix(sin(e - 0.8)*0.41, -0.9, P.tuck);
  float pitch = 0.24 + 0.42*uRest;
  pos += flapped(q, 0.33, e1, e2, max(0.0, cos(e)), pitch, P)*size;
  vShade = 0.76 + 0.24*abs(cos(e1));
  // (the body and the head are not flapped, so their normal only turns with the bird)
  float cp = cos(pitch), sp = sin(pitch);
  vec3 nb = vec3(normal.x, normal.y*cp + normal.z*sp, -normal.y*sp + normal.z*cp);
  vRim = pow(1.0 - abs(dot(normalize(P.side*nb.x + P.up*nb.y + P.fwd*nb.z), normalize(cameraPosition - pos))), 2.0);
  gl_Position = projectionMatrix*viewMatrix*vec4(pos, 1.0);
}
