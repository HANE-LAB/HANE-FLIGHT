import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from './bloom';
import { PR, RT_TYPE, camera, fxScene, renderer, scene } from './renderer';
import { U } from './uniforms';
import { makeCloudPass, type CloudPass } from './clouds';
import { OpticsPass, glassTex } from './optics';
import { cloudCompFrag, fullscreenVert, gradeFrag } from './shaders';
import frostUrl from './frost.png?inline';

/* =====================================================================
   POST — as in Voyage, with the clouds laid in:
     1 the opaque scene into a multisampled half-float target (with depth)
     2 the clouds at half size or less, stopped by that depth (src/clouds.ts)
     3 the clouds laid over the scene, writing the scene's depth back into the other target
     4 the additive and translucent effects (glows, feathers), each fogging itself, tested against that depth
     5 r128 bloom
     6 what the sun does in the lens (src/optics.ts), on a layer of its own, so it does not bloom again
     7 one grade pass: tone curve, vignette, the 二次元 colour edit (a baked 3D LUT), grain
   ===================================================================== */
const smoothstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a)/(b - a))); return t*t*(3 - 2*t); };
// The colour edit, applied to display colours after the tone curve; baked into a 33³ table indexed by the square root of
// each channel (the rows go to the dark colours a night scene is made of). Voyage's toonGrade, with this night's colours:
// cool moonlit shadows, warm highlights, so the vermilion and the lanterns stand out; the darkest areas stay deep indigo.
function toonGrade(r: number, g: number, b: number){
  const l = 0.299*r + 0.587*g + 0.114*b;
  const sat = (c: number) => Math.min(1, Math.max(0, l + (c - l)*1.18));
  const w = smoothstep(0.02, 0.55, l), tint = [0.94 + 0.10*w, 0.97 + 0.03*w, 1.08 - 0.12*w];
  const tl = 0.299*tint[0] + 0.587*tint[1] + 0.114*tint[2];
  const split = (c: number, k: number) => Math.min(1, sat(c)*tint[k]/tl);
  const lift = 1 - smoothstep(0, 0.30, l);
  return [split(r, 0) + 0.008*lift, split(g, 1) + 0.010*lift, split(b, 2) + 0.026*lift];
}
const LUT_N = 33;
function bakeLut(){
  const N = LUT_N, data = new Uint16Array(N*N*N*4);
  for (let b = 0, i = 0; b < N; b++) for (let g = 0; g < N; g++) for (let r = 0; r < N; r++, i += 4){
    const c = toonGrade((r/(N - 1))**2, (g/(N - 1))**2, (b/(N - 1))**2);
    for (let k = 0; k < 3; k++) data[i + k] = THREE.DataUtils.toHalfFloat(c[k]);
    data[i + 3] = THREE.DataUtils.toHalfFloat(1);
  }
  const tex = new THREE.Data3DTexture(data, N, N, N);
  tex.type = THREE.HalfFloatType; tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = tex.wrapR = THREE.ClampToEdgeWrapping; tex.needsUpdate = true;
  return tex;
}
let gradePass: ShaderPass | null = null;
export let composer: EffectComposer | null = null, bloomPass: UnrealBloomPass | null = null, cloudPass: CloudPass | null = null;
let compPass: ShaderPass | null = null, frostTex: THREE.Texture | null = null;
try {
  const samples = ((screen.width*screen.height*PR*PR > 4.2e6) ? 2 : 4);
  const depth = new THREE.DepthTexture(2, 2); depth.type = THREE.UnsignedIntType;
  const sceneRT = new THREE.WebGLRenderTarget(2, 2, { type: RT_TYPE, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, samples, depthTexture: depth });
  composer = new EffectComposer(renderer, sceneRT);
  // the second target (clouds laid over the scene, then the additive effects) needs no multisampling: its own depth
  // texture, written by the cloud composite, is all the effects test against
  const depth2 = new THREE.DepthTexture(2, 2); depth2.type = THREE.UnsignedIntType;
  const rt2 = new THREE.WebGLRenderTarget(2, 2, { type: RT_TYPE, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthTexture: depth2 });
  composer.renderTarget2.dispose(); composer.renderTarget2 = rt2; composer.writeBuffer = rt2;
  composer.addPass(new RenderPass(scene, camera));
  cloudPass = makeCloudPass(depth);
  U.tOcc.value = cloudPass.rt.textures[1];
  composer.addPass(cloudPass);
  compPass = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, tDepth: { value: null }, tClouds: { value: null }, tOcc: { value: null }, uCloudRes: { value: new THREE.Vector2(1, 1) }, uNear: { value: camera.near }, uFar: { value: camera.far }, uOn: { value: 1 } },
    vertexShader: fullscreenVert, fragmentShader: cloudCompFrag,
  });
  // ShaderPass copies its uniforms, and a render target's texture cannot be copied: set them on the copy
  compPass.uniforms.tDepth.value = depth; compPass.uniforms.tClouds.value = cloudPass.rt.textures[0]; compPass.uniforms.tOcc.value = cloudPass.rt.textures[1];
  // the quad writes the scene's depth (gl_FragDepth) into the other target, for the effects pass to test against
  const cm = compPass.material; cm.depthTest = true; cm.depthWrite = true; cm.depthFunc = THREE.AlwaysDepth;
  composer.addPass(compPass);
  const fx = new RenderPass(fxScene, camera); fx.clear = false; composer.addPass(fx);
  bloomPass = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.95, 0.62, 0.60);
  composer.addPass(bloomPass);
  const optics = new OpticsPass();
  composer.addPass(optics);
  gradePass = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, tBloom: { value: null }, tLut: { value: bakeLut() }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) }, tFrost: { value: null }, uFrost: { value: 0 }, tGlass: { value: null }, uGlass: { value: 0 } },
    vertexShader: fullscreenVert, fragmentShader: gradeFrag,
  });
  gradePass.uniforms.tBloom.value = bloomPass.renderTargetsHorizontal[0].texture;
  gradePass.uniforms.tGlass.value = glassTex; gradePass.uniforms.uGlass = optics.on;
  new THREE.TextureLoader().load(frostUrl, t => { t.flipY = false; t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; t.needsUpdate = true; frostTex = t; if (gradePass) gradePass.uniforms.tFrost.value = t; });
  gradePass.needsSwap = false;
  composer.addPass(gradePass);
} catch (e){ console.error('post', e); composer = null; }

export function setPostSize(w: number, h: number){
  U.uPR.value = PR;
  if (!composer || !gradePass || !compPass || !cloudPass) return;
  composer.setPixelRatio(PR); composer.setSize(w, h);
  gradePass.uniforms.uRes.value.set(Math.round(w*PR), Math.round(h*PR)); U.uFxRes.value.copy(gradePass.uniforms.uRes.value);
  compPass.uniforms.uCloudRes.value.set(cloudPass.rt.width, cloudPass.rt.height);
  compPass.uniforms.uNear.value = camera.near; compPass.uniforms.uFar.value = camera.far;
}
/** Per frame: the grain's clock, and the buffers back where the chain expects them: the scene into the multisampled
 *  target, the clouds into the other. The cloud composite swaps them once a frame, so they would trade places every
 *  frame and the scene would land in the plain target on every other one. */
export function postFrame(t: number, frost: number){
  if (gradePass){ gradePass.uniforms.uTime.value = t; gradePass.uniforms.uFrost.value = frostTex ? frost : 0; }
  if (composer){ composer.readBuffer = composer.renderTarget1; composer.writeBuffer = composer.renderTarget2; }
}
export function setSamples(n: number){
  if (!composer) return;
  [composer.renderTarget1, composer.renderTarget2].forEach(r => { if (r && r.samples > n){ r.samples = n; r.dispose(); } });
}
