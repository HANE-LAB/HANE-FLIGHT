// The light inside the deck, baked once at half the deck's size (src/clouds.ts): the sun and the moon never move in this
// page, so what a ray would otherwise march toward the light for at every step of every pixel, each frame, is done here
// once per voxel (the costliest part of volumetric clouds, gone). r the moon's light, g the sun's, b the sky's.
// The light is optical depth toward the light through the repeating tile, with steps that grow, turned into brightness by
// Wrenninge's multiple-scattering octaves: three Beer's laws, each shallower and fainter, so a cloud's heart keeps a
// glow instead of going black. Stored as square roots, for the dark tones. The sky's is the same straight up.
uniform sampler3D tDensity; uniform float uLayer; uniform float uLayers; uniform vec3 uMoonL; uniform vec3 uSunL; uniform float uP; uniform float uH; uniform float uSigma;
varying vec2 vUv;
float dens(vec3 p){ return clamp((texture(tDensity, vec3(p.x/uP, p.z/uP, p.y/uH)).r*2.0 - 0.6)/0.16, 0.0, 1.0); }   // the deck's field, as density
float depthTo(vec3 p, vec3 L, int steps, float dt0, float grow){
  float tau = 0.0, t = 0.5*dt0, dt = dt0;
  for (int i = 0; i < steps; i++){
    vec3 q = p + L*(t + 0.5*dt);
    if (q.y > uH) break;
    tau += dens(q)*dt;
    t += dt; dt *= grow;
  }
  return tau*uSigma;
}
float scatter(float tau){ return 0.58*exp(-tau) + 0.30*exp(-tau*0.25) + 0.12*exp(-tau*0.06); }
void main(){
  vec3 p = vec3(vUv.x*uP, (uLayer + 0.5)/uLayers*uH, vUv.y*uP);
  float moon = scatter(depthTo(p, uMoonL, 16, 5.0, 1.30));
  float sun = scatter(depthTo(p, uSunL, 18, 6.0, 1.30));
  float sky = exp(-depthTo(p, vec3(0.0, 1.0, 0.0), 6, 7.0, 1.4)*0.5);
  gl_FragColor = vec4(sqrt(moon), sqrt(sun), sky, 1.0);
}
