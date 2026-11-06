// The deck as it is read every frame (src/clouds.ts): r the field, g the sky's light, b the moon's, a the sun's. One texture
// read per step gives a ray everything it needs.
uniform sampler3D tDensity; uniform sampler3D tLight; uniform float uLayer; uniform float uLayers;
varying vec2 vUv;
void main(){
  vec3 q = vec3(vUv, (uLayer + 0.5)/uLayers);
  vec4 l = texture(tLight, q);
  gl_FragColor = vec4(texture(tDensity, q).r, l.b, l.r, l.g);
}
