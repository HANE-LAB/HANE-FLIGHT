// Lays the small cloud image over the scene (src/post.ts) and writes the depth back: the scene's, or nearer, where the cloud
// has become opaque, so the effects drawn after it (glows, wisps) are hidden by the gates and by the cloud. Four filtered
// reads half a cloud texel away from this pixel make a small tent over the cloud image, which smooths what the short march
// leaves, weighted toward those whose depth is close to this pixel's: a gate's edge in front of a cloud bank does not pick
// up a fringe of cloud. The depth is kept as its reciprocal, as a depth buffer's is, so that it can be filtered and averaged: a
// ray that found nothing counts as nothing, not as infinitely far, and the dither of rays skimming a bank does not cut holes.
uniform sampler2D tDiffuse; uniform sampler2D tDepth; uniform sampler2D tClouds; uniform sampler2D tOcc; uniform vec2 uCloudRes; uniform float uNear; uniform float uFar; uniform float uOn;
varying vec2 vUv;
float viewZ(float d){ return uNear*uFar/(uFar - d*(uFar - uNear)); }
void main(){
  float dz = texture2D(tDepth, vUv).r, z = viewZ(dz);
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  float dOut = dz;
  if (uOn > 0.5){
    vec2 s = 0.5/uCloudRes;
    vec4 sum = vec4(0.0); float acc = 0.0, occ = 0.0;
    for (int k = 0; k < 4; k++){
      vec2 o = vec2(float(k - 2*(k/2)), float(k/2))*2.0 - 1.0, q = vUv + o*s;
      float zq = viewZ(texture2D(tDepth, q).r);
      float w = 1.0/(1e-3 + abs(zq - z)/max(z, 1.0));
      sum += texture2D(tClouds, q)*w; occ += texture2D(tOcc, q).r*w; acc += w;
    }
    vec4 cl = sum/max(acc, 1e-6);
    float zc = max(acc, 1e-6)/max(occ, 1e-6);
    if (zc < z) dOut = uFar*(zc - uNear)/(zc*(uFar - uNear));
    c = uOn > 1.5 ? vec3(cl.a) : c*(1.0 - cl.a) + cl.rgb;   // uOn 2: the clouds' coverage alone, for tuning
  }
  gl_FragColor = vec4(c, 1.0);
  gl_FragDepth = dOut;
}
