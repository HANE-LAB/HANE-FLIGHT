// Her whole model (src/bird.ts): one skinned mesh. uv1: how far up the fire this feather goes, what this part is (plume.frag.glsl)
#ifndef USE_UV1
attribute vec2 uv1;
#endif
#include <skinning_pars_vertex>
uniform mat4 uRest;
varying vec2 vUv; varying vec2 vAux; varying vec3 vN; varying vec3 vV; varying float vAlong;
void main(){
  vUv = uv; vAux = uv1; vAlong = (uRest*vec4(position, 1.0)).z;
  vec3 objectNormal = normal;
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  vec3 transformed = position;
  #include <skinning_vertex>
  vec4 w = modelMatrix*vec4(transformed, 1.0);
  vN = normalize(mat3(modelMatrix)*objectNormal); vV = cameraPosition - w.xyz;
  gl_Position = projectionMatrix*viewMatrix*w;
}
