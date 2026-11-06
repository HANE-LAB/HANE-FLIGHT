// Feathers she sheds: camera-facing cards with an in-plane spin (iRot.x) and a foreshortening flip (iRot.y).
attribute vec3 iPos; attribute vec2 iRot; attribute float iLife;
varying vec2 vUv; varying float vL;
void main(){
  vUv = uv; vL = iLife*smoothstep(3.0, 10.0, length(iPos - cameraPosition));   // (going out as it nears the lens)
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 upv = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  float c = cos(iRot.x), s = sin(iRot.x);
  vec2 q = vec2(position.x * c - position.y * s, position.x * s + position.y * c); q.x *= iRot.y;
  float sc = 0.55 * (0.6 + 0.4 * iLife);
  vec3 w = iPos + (right * q.x + upv * q.y) * sc;
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}
