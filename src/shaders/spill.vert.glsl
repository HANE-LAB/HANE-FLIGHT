// Cloud gathering on a gate as it comes into being, and blowing off it once the fire has run along it (src/spill.ts).
// aA: kind (0 along the top beam, 1 along the tie beam, 2 up the posts, 3 loose round the head), where along it (-1 … 1, for the
// posts 0 … 1), two seeds. uG: the gate's foot and yaw; uQ: its height and how far it has come, which runs at about a second
// per unit at her usual speed.
attribute vec4 aA; attribute float aG;
uniform vec4 uG[SLOTS_N]; uniform vec2 uQ[SLOTS_N]; uniform float uKeep; uniform float uMist; uniform float uFogK;
#include <flight/sky>
varying vec2 vUv; varying float vA; varying vec3 vBack; varying float vHaze; varying float vSeed;
void main(){
  gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vUv = vec2(0.0); vA = 0.0; vBack = vec3(0.0); vHaze = 1.0; vSeed = aA.z;
  int g = int(aG + 0.5);
  vec4 G = uG[g]; float h = uQ[g].x, tau = uQ[g].y, kind = aA.x, s1 = aA.z, s2 = aA.w;
  if (tau <= 0.0 || s2 > uKeep) return;
  float c = cos(G.w), sn = sin(G.w);
  vec3 ax = vec3(c, 0.0, sn), az = vec3(-sn, 0.0, c);
  // where on the gate it settles and where it comes from, in gate heights (across, up, along the line): along the beams it
  // draws in from out to the sides; up the posts it climbs from the floor
  vec3 at, from; float big;
  float sx = aA.y < 0.0 ? -1.0 : 1.0;
  if (kind < 0.5){ at = vec3(aA.y*0.58, 0.90, (s1 - 0.5)*0.07); from = at + vec3(sx*(0.25 + 0.45*s2), 0.10 + 0.30*s1, (s2 - 0.5)*0.5); big = 0.10; }
  else if (kind < 1.5){ at = vec3(aA.y*0.42, 0.655, (s1 - 0.5)*0.06); from = at + vec3(sx*(0.30 + 0.40*s2), (s1 - 0.5)*0.25, (s2 - 0.5)*0.5); big = 0.085; }
  else if (kind < 2.5){ float side = aA.y < 0.5 ? -1.0 : 1.0; at = vec3(side*0.30, 0.03 + 0.80*fract(aA.y*2.0), (s1 - 0.5)*0.06); from = vec3(side*(0.30 + 0.16*s2), -0.02, (s2 - 0.5)*0.25); big = 0.085; }
  else { at = vec3(aA.y*0.62, 1.0 + 0.16*s1, (s2 - 0.5)*0.18); from = at + vec3(sx*0.5, 0.25, 0.0); big = 0.12; }
  // it gathers, slowing as it arrives; it holds until the fire has come by, then the wind takes it, out and up
  float gt = clamp((tau - 0.02 - 0.16*s1)/0.40, 0.0, 1.0), e = gt*(2.0 - gt);
  float rel = clamp((tau - 0.62 - 0.30*s2)/0.60, 0.0, 1.0);
  vec3 lp = mix(from, at, e);
  lp += vec3((lp.x < 0.0 ? -1.0 : 1.0)*(0.20 + 0.35*s1), 0.10 + 0.16*s2, -0.25*s2)*rel*(0.4 + rel);
  vec3 p = G.xyz + ax*lp.x*h + vec3(0.0, lp.y*h, 0.0) + az*lp.z*h;
  float r = h*big*(0.8 + 0.7*s1)*(0.75 + 0.35*e + 1.2*rel);
  vec2 size = vec2(r*1.7, r*1.1);
  float a = 0.62*smoothstep(0.0, 0.35, gt)*(1.0 - smoothstep(0.15, 1.0, rel));
  if (a <= 0.003) return;
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]), up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 w = p + right*position.x*size.x*2.0 + up*position.y*size.y*2.0;
  vec3 rd = p - cameraPosition; float t = length(rd);
  vUv = position.xy + 0.5;
  vA = a*exp(-uMist*t*0.6)*smoothstep(8.0, 30.0, t);   // gone in the mist's own distance; never a card over the lens
  vBack = skyColor(normalize(vec3(rd.x, max(rd.y, 0.015*t), rd.z)));
  vHaze = exp(-uFogK*300.0*log(1.0 + t/300.0));
  gl_Position = projectionMatrix*viewMatrix*vec4(w, 1.0);
}
