varying vec3 vC; varying float vA; varying float vBig;
void main(){
  vec2 q = gl_PointCoord - 0.5; float r = length(q)*2.0; if (r > 1.0) discard;
  float a = smoothstep(1.0, 0.0, r); a *= a;
  // the brightest become four-pointed sparkles, as in Voyage's 二次元 sky
  vec2 aq = abs(q)*2.0;
  float rays = max((1.0 - smoothstep(0.0, 0.08, aq.x))*(1.0 - aq.y), (1.0 - smoothstep(0.0, 0.08, aq.y))*(1.0 - aq.x));
  a = mix(a, max(smoothstep(0.35, 0.0, r), rays*0.8), vBig);
  gl_FragColor = vec4(vC*a*vA*0.55, 1.0);
}
