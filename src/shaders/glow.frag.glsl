uniform sampler2D uTex; uniform float uFogK; uniform float uMist;
varying vec2 vUv; varying float vA; varying vec3 vW;
void main(){
  float t = texture2D(uTex, vUv).a;
  // the haze thins it, but a light carries further than a wall; in the mist it dies with the mist's own distance
  float far = exp(-length(vW - cameraPosition)*(uFogK*0.6 + uMist*0.8));
  gl_FragColor = vec4(vec3(1.0, 0.62, 0.30)*t*vA*0.55*far, 1.0);
}
