// HANE's fire along a feather (src/plume.ts FIRE): vermilion at the root (u = 0) to pale gold at the tip, as scene
// values, so the tips glow through the bloom and the roots do not
uniform vec3 uFire[6]; uniform float uFireAt[6];
vec3 fire(float u){ vec3 c = uFire[0]; for (int i = 1; i < 6; i++) c = mix(c, uFire[i], smoothstep(uFireAt[i - 1], uFireAt[i], u)); return c; }
