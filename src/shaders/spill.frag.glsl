// A wisp of cloud (src/spill.ts): a soft blob torn by the clouds' own noise, lit from above in the cloud's own colours,
// premultiplied, and never a light (kept under the bloom threshold). Behind mist it thins by Beer's law: tOcc is one over the distance
// at which what lies in front is 80% opaque, so distance times tOcc is its optical depth in units of ln 5, and at that distance it is gone,
// with no edge where the depth test would cut it.
uniform sampler3D tNoise; uniform vec3 uCloudLit; uniform vec3 uAmb; uniform sampler2D tOcc; uniform vec2 uFxRes;
varying vec2 vUv; varying float vA; varying vec3 vBack; varying float vHaze; varying float vSeed;
void main(){
  vec2 q = vUv*2.0 - 1.0;
  float r = dot(q, q);
  if (r > 1.0) discard;
  float n = texture(tNoise, vec3(vUv*0.33 + vSeed*7.0, vSeed)).r;
  float x = texture2D(tOcc, gl_FragCoord.xy/uFxRes).r/gl_FragCoord.w;   // (gl_FragCoord.w is one over this point's view depth)
  float a = vA*(1.0 - r)*(1.0 - r)*smoothstep(0.12, 0.62, n + 0.35*(1.0 - r))*exp(-1.609*x)*(1.0 - smoothstep(0.6, 1.0, x));
  if (a < 0.004) discard;
  vec3 c = mix(uAmb, uCloudLit, smoothstep(-0.6, 0.8, q.y + (n - 0.5)*0.8));
  c = mix(vBack, c, vHaze);
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  if (l > 0.56) c *= 0.56/l;
  gl_FragColor = vec4(c*a, a);
}
