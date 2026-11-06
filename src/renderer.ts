import * as THREE from 'three';
import { $ } from './dom';

/* =====================================================================
   RENDERER — same pipeline as HANE Voyage: colours are used as written
   ===================================================================== */
THREE.ColorManagement.enabled = false;
const canvas = $<HTMLCanvasElement>('stage-canvas');
// (no antialiasing on the page's own buffer: everything is drawn into src/post.ts's targets, the canvas only takes the last pass)
export const renderer = (() => {
  try { return new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' }); }
  catch (e){ $('nogl').hidden = false; throw e; }
})();
/** A phone or small tablet: the same best settings as anything else, only its pixel ratio and cloud image are its own (below, src/clouds.ts), and how far it steps down (src/main.ts). */
export const PHONE = window.__phone ?? (navigator.maxTouchPoints > 0 && Math.min(screen.width, screen.height) < 900);
// (a phone has 2.6 to 3 device pixels to each of its own, and at 2 it looks all but the same as at its full count, for half the pixels. A small tablet has far more of them, so it is capped by their number too)
export let PR = Math.min(window.devicePixelRatio || 1, PHONE ? Math.min(2, Math.sqrt(1.7e6/(screen.width*screen.height))) : 1.5);
export const setPR = (v: number) => { PR = v; renderer.setPixelRatio(v); };
renderer.setPixelRatio(PR);
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;   // nothing is encoded on the way out (r128 look, as in Voyage)
renderer.setClearColor(0x06070f, 1);
export const scene = new THREE.Scene();
// Additive lights and translucent wisps (lantern glows, feathers, spilled cloud) are drawn after the cloud volume has been laid
// over the opaque scene (src/post.ts), each fogging itself; they write no depth, so the clouds could not place them.
export const fxScene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(36, 1, 0.5, 9000);
// half-float targets for the post chain where the GPU can render to them (src/post.ts)
const HDR = renderer.extensions.has('EXT_color_buffer_float');
export const RT_TYPE = HDR ? THREE.HalfFloatType : THREE.UnsignedByteType;

// Motion is full unless the viewer picks 减少 (remembered); the system setting is not followed, as in Voyage.
let saved: string | null = null;
try { saved = localStorage.getItem('hane-flight-motion'); } catch (e){}
export let reduceMotion = saved === 'calm';
document.body.classList.toggle('calm', reduceMotion);
export function setMotion(calm: boolean){
  reduceMotion = calm;
  try { localStorage.setItem('hane-flight-motion', calm ? 'calm' : 'full'); } catch (e){}
  document.body.classList.toggle('calm', calm);
}

/** A soft round glow, for the lanterns. */
export const glowTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d')!; const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,225,170,0.55)'); g.addColorStop(0.5, 'rgba(255,210,140,0.20)'); g.addColorStop(0.75, 'rgba(255,200,120,0.05)'); g.addColorStop(1, 'rgba(255,200,120,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
