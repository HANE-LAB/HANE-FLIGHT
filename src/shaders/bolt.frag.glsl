// A lightning channel: a white core over the bloom threshold, a cold edge. It is a light, for a moment. First the stepped leader, dim,
// all its branches alike, as far as it has come (uLead); then the return stroke, the main channel far the brightest.
uniform float uBoltA; uniform float uLeadA; uniform float uLead;
varying vec3 vV;
void main(){
  if (vV.z > uLead) discard;
  float c = exp(-vV.x*vV.x*5.0);
  gl_FragColor = vec4(vec3(0.80, 0.86, 1.25)*(c*c*c*3.4 + c*0.7)*(uBoltA*vV.y + uLeadA), 1.0);
}
