uniform sampler2D tStar; uniform vec3 uTint; uniform float uScale; uniform float uSize;
varying vec2 vQ; varying float vA;
void main(){
  // (kept as fourth roots: a little under its square is about how far a picture of a glare is seen to reach)
  vec3 t = pow(texture2D(tStar, vQ*0.5 + 0.5).rgb, vec3(1.7));
  float r = length(vQ);
  // (the middle of it is the disc and its bloom: a point of light has rings there, the sun does not)
  float hole = smoothstep(0.012, 0.075, r);
  // (and it fades before the card's edge)
  float rim = 1.0 - smoothstep(0.62, 1.0, r);
  // (and it is lighter close to the sun, or the gate the sun stands in loses its dark)
  float near = mix(0.25, 1.0, smoothstep(0.06, 0.30, r));
  // the veil: straylight round a bright source, as the eye has it (van den Berg et al. 2013's simplified form, θ in degrees); only the near part of it, the rest would be a grey wash over the frame
  float deg = max(atan(r*uSize/uScale)*57.296, 0.6), veil = (10.0/(deg*deg*deg) + 5.0/(deg*deg))*rim;
  gl_FragColor = vec4((t*hole*near*5.7 + 0.10*veil*hole)*uTint*vA*rim, 1.0);
}
