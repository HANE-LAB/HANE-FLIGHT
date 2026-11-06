import * as THREE from 'three';

/* =====================================================================
   SHARED UNIFORMS — every material picks what it needs from U, so setting U.x.value reaches all of them
   ===================================================================== */

export const U = {
  uTime: { value: 0 },
  // 二次元 lighting follows Voyage's (and GGXrd's) rule: the key is fixed and never taken from a moving light, so a shadow
  // edge only ever sits on a geometric edge. sky.ts sets it: the moon's side all night, turning to the sun in the last of
  // the dawn.
  uKey: { value: new THREE.Vector3(-0.42, 0.55, 0.72).normalize() },
  uDawn: { value: 0 },                                      // 0 night … 1 sunrise, by how far along the nights she is
  // the sky (src/sky.ts sets these every frame; src/shaders/chunks/sky.glsl reads them, for the dome and for the haze)
  uZen: { value: new THREE.Color() }, uMid: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uHorW: { value: new THREE.Color() },
  uWarm: { value: new THREE.Color() }, uPurple: { value: new THREE.Color() }, uShadowC: { value: new THREE.Color() }, uBeltC: { value: new THREE.Color() },
  uSunGlowC: { value: new THREE.Color() }, uMoonGlowC: { value: new THREE.Color() }, uMistTop: { value: new THREE.Color() }, uMistBot: { value: new THREE.Color() },
  uSunDir: { value: new THREE.Vector3(1, -0.3, 0) },        // toward the sun (below the horizon all night)
  uMoonDir: { value: new THREE.Vector3(0, 1, 0) },          // toward the moon
  uBright: { value: new THREE.Vector3(0, 1, 0) },           // the bright side of the horizon: the moon, then the sun
  uDusk: { value: 0 }, uInCloud: { value: 0 },
  uSunAmt: { value: 0 }, uSunC: { value: new THREE.Color(1.0, 0.55, 0.36) },   // dawn: how much the sun already lights what faces it, and its colour
  uFogK: { value: 0.0016 },                                 // aerial perspective: optical depth per log-metre (scene.glsl hazeT)
  uBird: { value: new THREE.Vector4(0, -1e4, 0, 0) },      // her fire: position and strength
  uWake: { value: new THREE.Vector4(0, 0, 1, 0) },         // the way she is going, how far her wings reach (m): what is in the air goes round her (air.vert.glsl)
  uEmber: { value: 0 },                                     // 0 … 1: how far her fire has sunk (src/age.ts)
  uCloudLit: { value: new THREE.Color(0.5, 0.56, 0.72) },  // the colour of lit cloud now (src/clouds.ts): what clings to a gate as it comes up
  uPx: { value: 800 },                                      // pixels per unit of tan(half fov), for screen-size fades
  uNearK: { value: 1 },                                     // how early a gate near the lens thins away (more while the lens is moving through them)
  uFlash: { value: new THREE.Vector4(0, 1, 0, 0) },         // lightning: the way to it, and how strong (src/weather.ts)
  uSnow: { value: 0 },                                      // how deep in the cold: 0 … 1
  uLent: { value: 0 },                                      // 借一道闪电: 0 … 1 (src/season.ts)
  uWet: { value: 0 },                                       // how wet the gates are, in a storm: 0 … 1
  uWind: { value: 0 },                                      // how hard the wind is on what hangs from the gates: 0 … about 1
  tOcc: { value: null as THREE.Texture | null },            // one over the view depth where the clouds and mist have become opaque (src/clouds.ts)
  uFxRes: { value: new THREE.Vector2(1, 1) },               // the size of the target the effects are drawn into, in pixels
  uPR: { value: 1 },                                        // its pixels to each CSS pixel
};
export const pick = <K extends keyof typeof U>(...k: K[]) => { const o = {} as Pick<typeof U, K>; k.forEach(n => o[n] = U[n]); return o; };
/** The fog/shade uniforms most scene materials need. */
export const SKY_KEYS = ['uZen', 'uMid', 'uHor', 'uHorW', 'uWarm', 'uPurple', 'uShadowC', 'uBeltC', 'uSunGlowC', 'uMoonGlowC', 'uSunDir', 'uMoonDir', 'uBright', 'uDusk', 'uInCloud', 'uMistTop', 'uMistBot', 'uSunAmt', 'uSunC'] as const;
export const sceneUniforms = () => pick('uTime', 'uKey', 'uDawn', 'uFogK', 'uBird', 'uCloudLit', 'uPx', 'uNearK', 'uFlash', 'uSnow', 'uWet', 'uWind', ...SKY_KEYS);
