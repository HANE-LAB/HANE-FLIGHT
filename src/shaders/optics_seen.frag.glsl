// How much of the sun's disc is getting through (src/optics.ts): its brightness at a few points of the picture, so what is in front of it does not have to be known. Written over one pixel with
// an alpha, which is an easing: the star covers the whole frame, and a post crossing the sun must not be a flash.
uniform sampler2D tScene; uniform vec2 uSunUv; uniform vec2 uDisc; uniform vec2 uLit; uniform float uOff; uniform float uClear; uniform float uEase;
void main(){
  float seen = 0.0;
  for (int i = 0; i < 8; i++){
    float a = float(i)*2.399963, r = sqrt((float(i) + 0.5)/8.0);
    vec3 c = texture2D(tScene, uSunUv + uDisc*r*vec2(cos(a), sin(a))).rgb;
    // (weighted to the red, not as luminance: the sun coming up is deep red, as dim as the mist round it by any measure that counts green)
    seen += smoothstep(uLit.x, uLit.y, dot(c, vec3(0.7, 0.2, 0.1)));
  }
  // (out of the frame there is nothing to read: as much as the disc itself is up, and src/optics.ts lets it fade by how far out it is)
  gl_FragColor = vec4(mix(seen/8.0, uClear, uOff), 0.0, 0.0, uEase);
}
