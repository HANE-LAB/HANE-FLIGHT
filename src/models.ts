import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import birdUrl from './figures/bird.glb?url';

/* =====================================================================
   MODELS — the birds' shapes, made in Blender (art/bird/). The file is inside the page like everything else; only decoding
   it takes a moment, and the page starts when that is done (main.ts).
   (Read straight from the page rather than fetched, even from itself: some places that host a page do not let it fetch at all.)
   ===================================================================== */
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
export const models: Promise<GLTF> = birdUrl.startsWith('data:') ? new Promise((done, fail) => {
  const bin = atob(birdUrl.slice(birdUrl.indexOf(',') + 1)), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  loader.parse(bytes.buffer, '', done, fail);
}) : loader.loadAsync(birdUrl);
