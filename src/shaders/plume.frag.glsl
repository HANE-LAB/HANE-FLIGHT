// 火羽 (src/plume.ts), she is her own light. vAux.y says what this part of the model is (art/bird/build.py):
// 0 a feather that only turns with its joint, 0.2 one that hangs (KawaiiPhysics), and 0.1 and 0.3 the same but in the colour of her hair; 0.4 the body, 0.5 the beak,
// 0.6 what she wears, 0.8 the face (chunks/face.glsl).
// How old she is and how her fire stands (src/age.ts): uYouth a chick's gold and down; uEmber the fire sunk to embers, the edges of the feathers still alight; uFlare it takes
// again; uFront a front of light along her length as she moults (where, how strong).
#include <flight/fire>
uniform sampler2D tPlume; uniform float uDawn; uniform float uShowHang; uniform float uEmber; uniform float uYouth; uniform float uFlare; uniform vec2 uFront;
uniform vec3 uHairA; uniform vec3 uHairB; uniform vec3 uKnot; uniform vec3 uOrnC[5]; uniform vec4 uEye; uniform float uM1;
#include <flight/face>
varying vec2 vUv; varying vec2 vAux; varying vec3 vN; varying vec3 vV; varying float vAlong;
void main(){
  vec3 n = normalize(vN), v = normalize(vV), c;
  float a = 1.0, kind = vAux.y;
  if (kind < 0.35){
    // the feather's shape from the texture, its fire from root to tip
    vec4 m = texture2D(tPlume, vUv);
    if (m.r < 0.02) discard;
    a = m.r;
    // against the dawn sky she burns deeper (the pale gold tips would vanish into it)
    // (a short feather does not go so far up the fire: vAux.x. The underside of a wing is deeper than its top)
    float under = gl_FrontFacing ? 1.0 : 0.80;
    float f = pow(vUv.x, 1.25)*vAux.x*under*(1.0 - 0.20*uDawn);
    // (a small feather on the body starts from the colour of the body, or it reads as a dark spot on it)
    f += 0.30*(1.0 - smoothstep(0.70, 0.90, vAux.x))*(1.0 - vUv.x);
    f = mix(f, 0.32 + 0.34*f, uYouth);
    f += (1.0 - f)*0.42*uFlare;
    c = fire(f)*(1.0 - 0.10*uDawn)*(1.0 + 0.08*uFlare);
    // (the crest, the bangs, the locks: the colour of her hair that year, root to tip)
    if (abs(kind - 0.1) < 0.04 || abs(kind - 0.3) < 0.04) c = mix(uHairA, uHairB, smoothstep(0.40, 1.0, vUv.x))*mix(0.68, 1.1, uDawn)*(1.0 + 0.3*uFlare);
    c = mix(c, c*0.34 + fire(f*0.40)*0.20, uEmber);
    c = mix(c, c*1.35 + vec3(0.10, 0.07, 0.03), m.a*0.45);   // the barbs, and the light along the inner edge
    // (the quill, pale: a small feather's hardly shows, or it reads as a leaf; down has none to speak of)
    c = mix(c, c*1.5 + vec3(0.16, 0.11, 0.05), m.b*mix(0.22, 0.8, smoothstep(0.70, 0.90, vAux.x))*(1.0 - 0.6*uYouth));
    c = mix(c, vec3(0.05, 0.010, 0.006), m.g*mix(0.30, 0.7, smoothstep(0.70, 0.90, vAux.x))*(1.0 - uEmber)*(1.0 - 0.75*uYouth));   // the dark rim keeps it apart from what is behind it (a small feather's lightly)
    c += fire(0.80)*m.g*uEmber*0.95;
    // a feather turned edge-on to the eye reads a little darker, so a fan reads as a fan
    c *= (0.72 + 0.28*abs(dot(n, v)))*mix(0.86, 1.0, under);
    if (uShowHang > 0.5) c = kind > 0.15 ? c : vec3(0.05, 0.16, 0.30)*(0.6 + 0.4*abs(dot(n, v)));
  } else if (kind < 0.45){
    // the body: the feathers' fire, deeper on the back and warmer toward the breast (art/bird/build.py), the edge glowing gold
    // (what shows between the feathers lies in their shade, or a neck is a smooth column with a few feathers on it)
    float f = mix(vUv.x*0.62, 0.42 + 0.34*vUv.x, uYouth)*(1.0 - 0.45*uDawn);
    c = mix(fire(f), fire(f*0.45)*0.55, uEmber);
    c = mix(c, fire(0.80 - 0.3*uDawn), pow(1.0 - abs(dot(n, v)), 3.0)*0.45);
    if (uShowHang > 0.5) c = vec3(0.05, 0.16, 0.30)*(0.6 + 0.4*abs(dot(n, v)));
  } else if (kind < 0.55){
    // the beak, gold at its root and deeper toward the tip, round: light above, dark under it
    c = fire(vUv.x)*(0.46 + 0.54*smoothstep(-0.8, 0.7, n.y))*(1.0 - 0.5*uEmber);
  } else if (kind < 0.7){
    // what she wears: u picks the colour, v goes from root to tip
    float id = vUv.x;
    c = id < 0.1 ? uKnot : id < 0.3 ? uOrnC[1] : id < 0.5 ? uOrnC[2] : id < 0.7 ? uOrnC[3]*mix(0.62, 1.08, vUv.y) : uOrnC[4];
    c *= (0.68 + 0.36*abs(dot(n, v)))*mix(0.70, 1.0, uDawn)*(1.0 - 0.35*uEmber);
  } else {
    vec4 f = faceAt(vUv, uEye.x, uEye.y, uEye.zw);
    if (f.a <= 0.01) discard;
    a = f.a;
    c = f.rgb;
  }
  float d = (vAlong - uFront.x)/0.22;
  c += fire(0.88)*exp(-d*d)*uFront.y*0.55;
  gl_FragColor = vec4(c, a);
}
