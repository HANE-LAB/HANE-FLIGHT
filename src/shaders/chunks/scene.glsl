// Shared by every lit scene material (src/uniforms.ts sceneUniforms): the fixed key, her fire, the sun at dawn, and the
// aerial perspective that lays far gates back into the sky.
uniform float uTime; uniform vec3 uKey; uniform float uDawn; uniform float uFogK; uniform vec4 uBird; uniform vec3 uCloudLit; uniform float uPx; uniform float uNearK; uniform vec4 uFlash; uniform float uSnow; uniform float uWet;

// how much a face turns to the key; the two tones are cut on it (Voyage, GGXrd: the key never moves within a view)
float keyLit(vec3 n){ return smoothstep(0.02, 0.14, dot(n, uKey)); }

// her fire, as a soft round pool; it only adds, smoothly (moving lights never cut a tone)
vec3 fireLight(vec3 w, vec3 n){
  vec3 d = uBird.xyz - w; float l = length(d);
  float b = uBird.w*exp(-l/8.0)*(0.55 + 0.45*max(dot(n, d/max(l, 1e-3)), 0.0));
  return vec3(1.0, 0.50, 0.22)*b;
}

// lightning: for a moment what faces it takes a cold light; it only adds, smoothly, like every light that moves
vec3 flashLight(vec3 n, vec3 base){ return vec3(0.62, 0.70, 1.0)*uFlash.w*(0.22 + 0.78*max(dot(n, uFlash.xyz), 0.0))*(0.16 + base); }

#include <flight/sky>
// First light: faces turned to the rising sun take a warm wash; it only adds, smoothly, and never moves the key's two
// tones (the GGXrd rule holds: the sun is not the key until the very end).
vec3 sunLight(vec3 n, vec3 base){ return uSunC*base*uSunAmt*smoothstep(0.0, 0.30, dot(n, uSunDir))*1.25; }
// Aerial perspective. The haze takes the colour of the sky behind what it covers. Its depth grows with the log of the
// distance (each doubling of the distance is one more wash, 近浓远淡). Blue saturates first.
vec3 hazeT(vec3 w){
  float t = length(w - cameraPosition);
  float tau = uFogK*300.0*log(1.0 + t/300.0);
  return exp(-tau*vec3(0.78, 0.90, 1.0));
}
// Every lit surface stays under the bloom threshold (0.60), as in Voyage: only lights glow. Her fire and the sun only
// add, so a face can climb toward it; this holds it just under (a soft knee from 0.50).
vec3 underBloom(vec3 c){ float l = dot(c, vec3(0.299, 0.587, 0.114)); return l > 0.50 ? c*(0.50 + 0.08*(1.0 - exp(-(l - 0.50)/0.08)))/l : c; }
// haze over a light (a lantern's paper): not held under the threshold, it is meant to glow
vec3 hazeLight(vec3 col, vec3 w){
  vec3 rd = normalize(w - cameraPosition);
  vec3 back = skyColor(normalize(vec3(rd.x, max(rd.y, 0.015), rd.z)));
  return mix(back, col, hazeT(w));
}
vec3 applyHaze(vec3 col, vec3 w){ return hazeLight(underBloom(col), w); }
// What passes the lens thins away rather than crossing it as a wall: the alpha goes to the multisampled target's coverage
// (alphaToCoverage on the material), so it needs no sorting and shows no pattern. Without multisampling only the dither in
// the last metres remains.
float nearAlpha(vec3 w){
  float t = length(w - cameraPosition);
  if (t < 3.0 && fract(52.9829189*fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) > smoothstep(1.0, 3.0, t)) discard;
  return smoothstep(2.0*uNearK, 8.0*uNearK, t);
}
// and a gate thins away the same way downward into the cloud's floor: no post shows where it ends, and what comes up out of
// the floor comes up out of nothing
float gateAlpha(vec3 w){ return nearAlpha(w)*smoothstep(-6.5, 1.5, w.y); }
