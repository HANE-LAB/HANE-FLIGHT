// A lightning channel (src/weather.ts): ribbons laid out in the world, once per strike. aV: across it (-1 … 1), how bright, when the leader reached it.
attribute vec3 aV;
varying vec3 vV;
void main(){
  vV = aV;
  gl_Position = projectionMatrix*viewMatrix*vec4(position, 1.0);
}
