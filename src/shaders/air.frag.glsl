// Snow, rain or a petal, premultiplied (src/weather.ts).
varying vec2 vUv; varying float vA; varying vec3 vC; varying float vSeed; varying float vBig;
void main(){
  vec2 q = vUv*2.0 - 1.0;
#if KIND == 0
  // a soft dot; near and big enough to read, a six-armed star (ice is hexagonal), turned its own way
  float r2 = dot(q, q), a = 1.0 - r2;
  if (a <= 0.0) discard;
  a *= a;
  if (vBig > 0.0){
    float th = atan(q.y, q.x) + vSeed*40.0, arm = pow(abs(cos(3.0*th)), 6.0), r = sqrt(r2);
    float star = smoothstep(0.30 + 0.70*arm, 0.18 + 0.60*arm, r) + 0.5*(1.0 - smoothstep(0.10, 0.34, r));
    a = mix(a, clamp(star, 0.0, 1.0), vBig);
  }
  a *= vA;
  gl_FragColor = vec4(vC*a, a);
#elif KIND == 1
  float a = (1.0 - q.x*q.x)*(0.25 + 0.75*vUv.y)*(1.0 - smoothstep(0.92, 1.0, vUv.y));
  if (a <= 0.0) discard;
  a *= vA;
  gl_FragColor = vec4(vC*a, a);
#else
  // broad toward its tip, with a small notch there, narrow at its foot; deeper toward the foot, a midrib
  float y = vUv.y, wide = 0.92*pow(max(sin(3.14159*pow(y, 0.70)), 0.0), 0.75);
  float e = abs(q.x)/max(wide, 1e-3) + smoothstep(0.84, 1.0, y)*(1.0 - smoothstep(0.0, 0.22, abs(q.x)))*1.2;
  float a = 1.0 - smoothstep(0.80, 1.0, e);
  if (a <= 0.0) discard;
  a *= vA;
  vec3 c = vC*(0.72 + 0.42*y)*(1.0 - 0.10*exp(-q.x*q.x*60.0));
  gl_FragColor = vec4(c*a, a);
#endif
}
