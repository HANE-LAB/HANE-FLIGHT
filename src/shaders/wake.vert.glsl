// What marks the ranks and those longest with her, from any distance (src/flock.ts). position.z 1, a card: a soft light of its own fire round a 总督 or a 提督, a star on a 舰长 who has
// reached a tier. position.z 0, a ribbon (x along it, y across): a wake of light behind a 总督, a 提督, and a 舰长 of a year or more, with one bead for each year.
// iW: days with her on the last day, how long the wake is at least, how wide the card, its rank among the 舰长 (-1 a 提督, -2 and on the 总督: which is also its place in uTint).
#define ROUND_POSTS
#include <flight/flock>
attribute vec4 iF; attribute vec4 iW;
uniform float uN; uniform float uDawn; uniform vec3 uTint[NTINT];
varying vec2 vC; varying float vT; varying float vI; varying float vYears; varying float vKind; varying float vHalo; varying float vSeed; varying vec3 vTint;
void main(){
  gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vC = vec2(0.0); vT = 0.0; vI = 0.0; vYears = 0.0; vKind = position.z; vHalo = 0.0; vSeed = iF.w;
  float a = iW.x - uAgo;
  vec3 t = tiersOf(a);
  bool kan = iW.w >= 0.0;
  vTint = uTint[kan ? 0 : int(0.5 - iW.w)];
  vHalo = kan ? 0.0 : (iW.w < -1.5 ? 2.0 : 1.0);
  // (a 舰长 has one only while it flies, and only from its first tier; a 总督 or 提督 from the day it comes)
  float on = kan ? t.x*clamp((uN - iW.w)/(uN*0.05 + 3.0), 0.0, 1.0) : smoothstep(0.0, 6.0, a);
  if (on <= 0.0) return;
  // (the same as its bird's in high.vert.glsl, or the wake would keep a lane of its own beside it)
  float span = kan ? 0.9 : (iW.w < -1.5 ? 3.4 : 1.9);
  bool sou = iW.w < -1.5;
  Place P = flockPlace(sou ? souUp(iF, -2.0 - iW.w) : (kan ? kanRest(iF) : iF), kan ? flockOut(iW.w) : (sou ? souOut(-2.0 - iW.w) : 12.0), kan ? 0.0 : (sou ? 9.0 : 3.0), span);
  float dC = max(length(P.pos - cameraPosition), 0.5), years = max(0.0, floor(a/365.0));
  vYears = years;
  if (position.z > 0.5){
    // a star keeps some size however far off, so it can be picked out of the flock from the whole view; the light round a rank is big anyway
    float R = kan ? max(0.22 + 0.30*t.y + 0.55*t.z, (3.5*t.x + 3.0*t.y + 7.0*t.z)*dC/uPx) : iW.z*(1.0 + 0.45*uRest);
    vI = on*(kan ? (0.30 + 0.15*t.y + 0.30*t.z)*smoothstep(3.0, 22.0, dC)*(1.0 - 0.5*uDawn) : smoothstep(R*0.8, 3.0*R + 5.0, dC));
    vC = position.xy;
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]), upv = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    gl_Position = projectionMatrix*viewMatrix*vec4(P.pos + (right*position.x + upv*position.y)*R, 1.0);
    return;
  }
  if (kan) on *= t.z;
  if (on <= 0.0) return;
  float tight = 1.0 - 0.3*uRest;
  vI = on*(kan ? 0.50 : 0.34);
  // (seen along its length, from behind her in flight, it is only a star of rays: seen from the side it is a line)
  float along = abs(dot(P.fwd, normalize(P.pos - cameraPosition)));
  vI *= (1.0 - 0.85*along*along*along*along)*(1.0 - 0.5*uRest);
  float s = position.x;
  float L = (iW.y + 18.0*t.z + 2.0*min(years, 6.0))*tight;
  // it streams behind and wanders, more toward its end; it lies where the bird has just been, so it bends round the post too
  float back = P.s - L*s;
  vec3 pos = P.pos - P.fwd0*L*s + P.side0*(roundPosts(P.x, back, span, iF.w).x*roundFade(back) - P.sw) + P.side*sin(P.tw*0.8 + s*4.5)*(0.12 + 0.05*L*s) + P.up*(sin(P.tw*0.6 + s*3.5)*(0.10 + 0.04*L*s));
  vec3 across = normalize(cross(P.fwd, pos - cameraPosition));
  float wid = (0.11 + 0.08*t.z + (kan ? 0.0 : 0.10))*(1.0 + 0.5*uRest);
  // (never under about a pixel and a half: thinner it would blink)
  wid = max(wid*(1.0 - 0.7*s), 0.8*length(pos - cameraPosition)/uPx);
  pos += across*position.y*wid;
  // (going out toward the lens: it runs straight at it, and would be a ray of light across the picture)
  vI *= smoothstep(10.0, 34.0, length(pos - cameraPosition));
  vC = vec2(0.0, position.y); vT = s;
  gl_Position = projectionMatrix*viewMatrix*vec4(pos, 1.0);
}
