// A far small bird: its fire from the root of the wing to its tip (the model's uv)
#include <flight/fire>
uniform float uDawn; uniform float uRest;
varying float vU; varying float vShade;
void main(){
  // (against the dawn sky deeper, and deeper again drawn together into her wings, or so many run together into white)
  gl_FragColor = vec4(fire(vU*(1.0 - 0.15*uDawn - 0.10*uRest))*vShade, 1.0);
}
