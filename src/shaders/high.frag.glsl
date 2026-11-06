// A small bird in feathers: the fire feather (src/plume.ts), as hers. Which fire tells the rank at a glance: the 舰长 the deep vermilion of the flock, going up through orange to
// pale gold as they have been with her longer (vOld); the 提督 and each of the 总督 their own (uRamp; uRank 1 and 2). They have no face: an eye, a dot with a glint.
#include <flight/fire>
uniform sampler2D tPlume; uniform float uDawn; uniform float uRest; uniform float uRank; uniform vec3 uRamp[3];
varying vec2 vUv; varying vec2 vAux; varying float vSolid; varying float vShade; varying float vOld; varying float vRim;
vec3 flame(float u){ return uRank < 0.5 ? fire(u) : mix(mix(uRamp[0], uRamp[1], smoothstep(0.0, 0.55, u)), uRamp[2], smoothstep(0.55, 1.0, u)); }
void main(){
  vec3 c; float a = 1.0, deep = 1.0 - 0.15*uDawn - 0.10*uRest;
  if (vAux.y < 0.35){
    vec4 m = texture2D(tPlume, vUv);
    a = mix(m.r, 1.0, vSolid);
    if (a < 0.02) discard;
    float u = uRank < 0.5 ? (0.10 + 0.62*vUv.x)*vAux.x*deep : (0.14 + 0.72*vUv.x)*vAux.x;
    u = mix(u, (0.46 + 0.40*u)*deep, vOld);
    c = flame(u);
    c = mix(c, vec3(1.2, 1.05, 0.8), 0.20*smoothstep(0.72, 1.0, vOld)*vUv.x*(1.0 - 0.7*uDawn));
    c = mix(c, c*1.35 + vec3(0.10, 0.07, 0.03)*(1.0 - 0.5*step(0.5, uRank)), m.a*0.45*(1.0 - vSolid));
    c = mix(c, c*1.5 + vec3(0.14, 0.10, 0.05), m.b*0.6*(1.0 - vSolid));
    c = mix(c, vec3(0.05, 0.010, 0.006), m.g*0.65*(1.0 - vSolid));
    // (a tail feather with an eye near its end, as a peacock's: vAux.y 0.2)
    if (vAux.y > 0.15){
      float r = length(vec2((vUv.x - 0.80)/0.075, (vUv.y - 0.56)/0.20));
      c = mix(c, mix(uRamp[0], flame(0.96), smoothstep(0.62, 0.40, r)), smoothstep(1.0, 0.80, r)*(1.0 - vSolid));
    }
  } else if (vAux.y < 0.45){
    // (what shows between its feathers lies in their shade; the fire is on the feathers)
    c = flame(vUv.x*0.62*deep + 0.5*vOld*(1.0 - vUv.x));
    c = mix(c, flame(0.70), vRim*0.30);
  } else if (vAux.y < 0.55){
    c = fire(vUv.x);
  } else {
    vec2 e = vUv*2.0 - 1.0;
    if (dot(e, e) > 1.0) discard;
    gl_FragColor = vec4(mix(vec3(0.012, 0.007, 0.006), vec3(1.0, 0.92, 0.80), smoothstep(0.40, 0.30, length(e - vec2(-0.25, 0.30)))), 1.0);
    return;
  }
  // (by night those longest with her are held under the bloom, as her hair is, or close by the lens they are a white ghost and no bird)
  gl_FragColor = vec4(c*vShade*mix(1.0, mix(0.64, 1.0, uDawn), vOld), a);
}
