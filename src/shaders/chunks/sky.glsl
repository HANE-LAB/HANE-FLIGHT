// The sky as a function of direction (src/sky.ts sets the palette every frame). The dome draws it, and every lit
// material takes its haze colour from it in the direction it is seen (aerial perspective takes the colour of the sky
// behind), so far gates and far cloud melt into the sky right behind them.
uniform vec3 uZen; uniform vec3 uMid; uniform vec3 uHor; uniform vec3 uHorW; uniform vec3 uWarm; uniform vec3 uPurple;
uniform vec3 uShadowC; uniform vec3 uBeltC; uniform vec3 uSunGlowC; uniform vec3 uMoonGlowC;
uniform vec3 uSunDir; uniform vec3 uMoonDir; uniform vec3 uBright; uniform float uDusk; uniform float uInCloud;
uniform vec3 uMistTop; uniform vec3 uMistBot; uniform float uSunAmt; uniform vec3 uSunC;
float hgPhase(float c, float g){ float g2 = g*g; return (1.0 - g2)/pow(max(1.0 + g2 - 2.0*g*c, 1e-4), 1.5)*0.0795775; }
// Holds a sky or cloud colour under the bloom threshold on a soft knee from 0.50, and pales it the further it was over
// (as film rolls a bright sky off toward white): only darkening it turned the sunrise a flat, saturated red.
vec3 holdUnder(vec3 c){
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  if (l <= 0.50) return c;
  float k = (0.50 + 0.08*(1.0 - exp(-(l - 0.50)/0.08)))/l;
  return mix(c, vec3(l), 0.55*smoothstep(0.50, 1.10, l))*k;
}
vec3 skyColor(vec3 d){
  float y = d.y, hy = max(y, 0.0), alt = asin(clamp(y, -1.0, 1.0));
  vec2 hd = normalize(d.xz + vec2(1e-5)), hs = normalize(uSunDir.xz + vec2(1e-5));
  float az = dot(hd, normalize(uBright.xz + vec2(1e-5)));   // toward the bright side: the moon by night, the sun at twilight
  float azs = dot(hd, hs);
  vec3 hor = mix(uHorW, uHor, smoothstep(-0.6, 0.8, az));
  vec3 c = mix(hor, uMid, smoothstep(0.0, 0.52, hy));
  c = mix(c, uZen, smoothstep(0.42, 1.0, hy));
  // twilight: a warm band hugging the horizon under the sun, the purple light above it
  float sunSide = smoothstep(0.15, 1.0, azs);
  c = mix(c, uWarm, sunSide*sunSide*exp(-hy*8.0)*uDusk);
  c = mix(c, uPurple, sunSide*smoothstep(0.06, 0.18, hy)*(1.0 - smoothstep(0.28, 0.60, hy))*uDusk*0.55);
  // Earth's shadow on the far side, and the Belt of Venus above it
  float dep = max(0.0, -asin(clamp(uSunDir.y, -1.0, 1.0)));
  float edge = 2.0*dep + 0.015, anti = smoothstep(0.2, -0.8, azs)*uDusk;
  c = mix(c, uShadowC, anti*(1.0 - smoothstep(edge - 0.02, edge + 0.02, alt))*0.75*step(0.0, alt));
  c = mix(c, uBeltC, anti*smoothstep(edge, edge + 0.04, alt)*(1.0 - smoothstep(edge + 0.10, edge + 0.30, alt))*0.6);
  // the sky's own colours stay under the bloom threshold (0.60), as every surface does; only the sun and the moon,
  // and the tight glows round them, are lights
  c = holdUnder(c);
  // glows round the sun and the moon. The broad ones are sky and are held under the bloom threshold with it (at
  // sunrise they put the whole eastern sky over it and the bloom laid a milky veil over the frame); the tight aureole
  // round each disc is the light, and blooms where it is
  float cs = dot(d, uSunDir), cm = dot(d, uMoonDir);
  c += uSunGlowC*0.055*hgPhase(cs, 0.70) + uMoonGlowC*0.05*hgPhase(cm, 0.75);
  c = holdUnder(c);
  // (the sun's tight glow waits for the sun: before it breaks the horizon it would already read as a great sun)
  c += uSunGlowC*0.02*hgPhase(cs, 0.95)*(0.10 + 0.90*uSunAmt) + uMoonGlowC*0.012*hgPhase(cm, 0.96);
  if (y < 0.0) c = mix(c, c*0.6, smoothstep(0.0, -0.25, y));   // (what shows below the horizon, past the cloud, is the sky's own horizon)
  // inside the band the sky is the mist, lighter upward where the moon is
  return mix(c, mix(uMistBot, uMistTop, smoothstep(-0.6, 0.8, y)), uInCloud);
}
