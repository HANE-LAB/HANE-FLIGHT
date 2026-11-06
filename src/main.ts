// Each module builds its part of the scene when it is imported; the order is the draw order for ties (as in Voyage).
import * as THREE from 'three';
import { $, smooth } from './dom';
import { JUMP, SLOTS, dayOf } from './data';
import { PHONE, PR, camera, fxScene, renderer, scene, setPR } from './renderer';
import { U } from './uniforms';
import { atDay, bendAt, dayAtS, mistAt, sAt, tangentAt } from './path';
import { dawnAt, updateSeason, W } from './season';
import { updateSky } from './sky';
import { deckDebug, updateClouds } from './clouds';
import { GLOW_MIST, cullGates, gatesTo, iA, iB, iC, iD, iE, rising, updateGates } from './gates';
import { setSpillKeep, updateSpill } from './spill';
import { setAirKeep, updateWeather } from './weather';
import { dayNow, flock, flockReady, reachOf, snapFlock, updateFlock } from './flock';
import { sizeAt } from './age';
import { emitFeather, updateTrail } from './trail';
import { bird, birdGlow, birdReady, flight as carriage, hover, poseBird } from './bird';
import { REST, advance, bigAt, endDay, restAt, seek, seq } from './sequencer';
import { craneAt, resetLens, setView, updateCamera, view } from './camera';
import { initUi, leaveReading, updateUi } from './ui';
import { soundState, updateSound } from './sound';
import { bloomPass, cloudPass, composer, postFrame, setPostSize, setSamples } from './post';

/* =====================================================================
   PLAYBACK + INPUT
   ===================================================================== */
const qs = new URLSearchParams(location.search);
let speedMul = Number(qs.get('speed') || 1);
seq.cruise = Number(qs.get('cruise') || seq.cruise);
seq.playing = !qs.has('pause');
const go = (day: number) => { stopAt = null; seek(day); snapFlock(seq.u); };
let stopAt: number | null = null;
if (qs.has('noui')) document.body.classList.add('noui');
go(qs.has('d') ? Number(qs.get('d')) : qs.has('from') ? dayOf(qs.get('from')!) : seq.film ? 0 : REST);

function setPlay(on: boolean){ seq.playing = on; if (on){ leaveReading(); } else stopAt = null; }
// (speeds: the usual, then quicker, then slower than the usual)
const SPEEDS: [number, string][] = [[1, '常飞'], [2, '疾飞'], [4, '迅飞'], [0.5, '缓飞']];
const speedLabel = () => (SPEEDS.find(s => s[0] === speedMul) ?? SPEEDS[0])[1];
$('play').onclick = () => {
  // (stopped at the end of the flight, it can only start again)
  if (seq.u >= endDay() - 0.01) return fly(false, 0);
  setPlay(!seq.playing);
};
addEventListener('keydown', e => {
  if (e.target instanceof HTMLInputElement) return;
  if (e.code === 'Space'){ e.preventDefault(); setPlay(!seq.playing); }
  if (e.code === 'ArrowRight') go(seq.u + (e.shiftKey ? 30 : 1));
  if (e.code === 'ArrowLeft') go(seq.u - (e.shiftKey ? 30 : 1));
});
setPlay(seq.playing);

// waiting at today: the two ways to start, as in Voyage. While she flies a way back; the film, which is for recording, shows nothing until its end (Esc leaves it)
function updateToday(){
  const atEnd = seq.u >= endDay() - 0.01;
  $('today').hidden = !atEnd; $('skip').hidden = atEnd || seq.film;
  $('todayHint').hidden = $('fromStart').hidden = $('toFilm').hidden = seq.film; $('toToday').hidden = !seq.film;
  document.body.classList.toggle('film', seq.film);
}
const fly = (film: boolean, day: number) => { seq.film = film; go(day); setPlay(true); resetLens(); updateToday(); };
$('fromStart').onclick = () => fly(false, 0);
$('toFilm').onclick = () => fly(true, 0);
$('toToday').onclick = $('skip').onclick = () => fly(false, REST);
addEventListener('keydown', e => { if (e.code !== 'Escape' || leaveReading()) return; if (seq.film || seq.u < endDay() - 0.01) fly(false, REST); else resetLens(); });
updateToday();
/** Fly into a night's gate and stop with it in front of her: from far enough back that it comes up out of the cloud before her eyes. A short dimming over the jump. */
const veil = $('veil');
function flyTo(day: number){
  veil.classList.add('on');
  setTimeout(() => {
    const s = sAt(day);
    go(dayAtS(Math.max(0, s - 240))); stopAt = dayAtS(Math.max(0, s - 26)); setPlay(true); resetLens();
    updateToday();
    veil.classList.remove('on');
  }, 270);
}
initUi({ go, flyTo, stepSpeed: () => { const k = SPEEDS.findIndex(s => s[0] === speedMul); speedMul = SPEEDS[(k + 1)%SPEEDS.length][0]; return speedLabel(); }, speedLabel });

window.flight = {
  seek: d => go(typeof d === 'string' ? dayOf(d) : d),
  play: setPlay,
  speed: k => { speedMul = k; },
  view: n => setView(n),
  lens: (yaw, pitch, zoom) => { view.yaw = yaw; view.pitch = pitch; view.zoom = zoom; },
  state: () => ({ u: seq.u, simT: seq.simT, flock: flock.n }),
};
// handles for looking into the scene from the console while tuning (not used by the page)
window.__dbg = { THREE, scene, fxScene, camera, renderer, U, seq, W, deckDebug, iA, iB, iC, iD, iE, SLOTS, get composer(){ return composer; }, get cloud(){ return cloudPass; }, get bloom(){ return bloomPass; }, get sound(){ return soundState(); } };

/* =====================================================================
   GPU TIME — only when a timing script (dev/perf.mjs) opened the page with window.__gpuMs set: one timer query round
   each frame's whole render, read back a few frames later
   ===================================================================== */
const gl = renderer.getContext() as WebGL2RenderingContext;
const tq = window.__gpuMs ? gl.getExtension('EXT_disjoint_timer_query_webgl2') : null;
const pending: WebGLQuery[] = [];
function gpuBegin(){ if (!tq) return null; const q = gl.createQuery(); if (q) gl.beginQuery(tq.TIME_ELAPSED_EXT, q); return q; }
function gpuEnd(q: WebGLQuery | null){
  if (!tq || !q) return;
  gl.endQuery(tq.TIME_ELAPSED_EXT); pending.push(q);
  while (pending.length && gl.getQueryParameter(pending[0], gl.QUERY_RESULT_AVAILABLE)){
    const r = pending.shift()!, ns = gl.getQueryParameter(r, gl.QUERY_RESULT) as number;
    if (!gl.getParameter(tq.GPU_DISJOINT_EXT)) window.__gpuMs!.push(ns/1e6);
    gl.deleteQuery(r);
  }
}

/* =====================================================================
   FRAME
   ===================================================================== */
const timer = new THREE.Timer(); let uiAcc = 0, lastSimT = 0, lastU = seq.u;
const tmp = new THREE.Vector3(), dir = new THREE.Vector3(), tan = new THREE.Vector3(), Y_AXIS = new THREE.Vector3(0, 1, 0);
// (test only, dev/film.mjs: frame by frame, each a fixed step on a clock of its own, so a clip does not depend on how fast the machine is)
let clockMs = performance.now();
if (window.__frameByFrame) window.__frame = dt => { clockMs += dt*1000; frame(); };
function frame(){
  if (!window.__frameByFrame) requestAnimationFrame(frame);
  timer.update(window.__frameByFrame ? clockMs : undefined); const raw = timer.getDelta(), dt0 = Math.min(0.05, raw); const t = timer.getElapsed(); const dt = dt0 * speedMul;
  adaptQuality(raw);
  U.uTime.value = t;
  advance(dt);
  if (stopAt !== null && seq.u >= stopAt){ seq.u = stopAt; setPlay(false); }
  const u = seq.u;
  updateSound(u, dt0);
  updateGates(u, flock.n); updateFlock(u, dt0, carriage.ph, carriage.amp); updateTrail(dt, t);

  // she flies along the line through the gates, under their tie beams; past the last gate the line itself climbs away.
  // she sheds feathers as the sim clock runs (none while paused)
  const shed = Math.min(1, Math.max(0, seq.simT - lastSimT)*40); lastSimT = seq.simT;
  const rest = restAt(u);
  atDay(u, tmp); tangentAt(u, tan); tmp.y += 7.2 + 7*rest + Math.sin(t*1.7)*0.35*(1 - rest) + carriage.heave + hover.y; tmp.x += hover.x; tmp.z += hover.z;
  // (her body stays square to the line whichever way the lens is, or her wings would not run on into the flock's: only her head turns to look at you)
  dir.copy(tan).applyAxisAngle(Y_AXIS, hover.yaw);
  dir.y += carriage.pitch + 0.55*rest;   // (nose up: she is always climbing, and from behind the lens sees her back and both wings open; waiting at today more so, braking on the wind, not standing up in it)
  if (Math.random() < 0.35*shed*(1 - 0.5*U.uEmber.value)) emitFeather(tmp, tan.clone().multiplyScalar(-8));
  bird.position.copy(tmp); bird.up.set(-bendAt(u)*90 + carriage.buffet + hover.lean, 1, 0).normalize(); bird.lookAt(tmp.clone().add(dir)); birdGlow.position.copy(tmp);
  // (when the lens rises high behind her on the night the count jumps, she must still be the light that leads them)
  const crane = craneAt(u);
  const day = dayNow(u), size = sizeAt(day);
  birdGlow.scale.setScalar((9 + 26*crane + 16*rest)*size); bird.scale.setScalar(2.6*(1 + 1.7*rest)*size);
  // (seen from close the glow is only a haze over her feathers)
  birdGlow.material.opacity = 0.42*carriage.glow*smooth(camera.position.distanceTo(tmp), 8 + 24*rest, 22 + 90*rest);
  U.uNearK.value = 1 + 2.2*Math.sin(Math.PI*Math.min(1, crane*1.6));   // (rising through them, the near gates thin away sooner)
  poseBird(bigAt(u), rest, t, dt0, day, flock.n);
  // her fire on the wood (only while near) and on the cloud; less of it when it has sunk
  U.uBird.value.set(tmp.x, tmp.y, tmp.z, 1.6*(1 - 0.45*U.uEmber.value));
  // (the air she parts, for what is in it: how far her wings reach; waiting at today she is not going anywhere)
  U.uWake.value.set(tan.x, tan.y, tan.z, 3.8*size*(1 - rest));

  const dawn = dawnAt(u);
  U.uDawn.value = dawn;
  updateSeason(u, dawn, Math.abs(u - lastU)/Math.max(dt0, 1e-3)); lastU = u;
  updateCamera(u, dt0);
  // (test only, dev/film.mjs: a lens put anywhere, to read the posts)
  if (window.__lensAt){ const L = window.__lensAt; camera.position.set(L.at[0], L.at[1], L.at[2]); camera.lookAt(L.look[0], L.look[1], L.look[2]); camera.fov = L.fov; camera.updateProjectionMatrix(); U.uPx.value = innerHeight/2/Math.tan(L.fov*Math.PI/360); }
  camera.updateMatrixWorld(); cullGates(camera);
  updateWeather(sAt(u), seq.simT);
  updateSky(u, dawn);
  updateClouds(seq.simT, u, dawn, tmp, 0.13 + 0.10*Math.min(1, flock.n/1500), 24 + reachOf(flock.n)*0.9, gatesTo());
  if (cloudPass){ const f = cloudPass.mat.uniforms.uForm.value as THREE.Vector4[]; for (let k = 0; k < f.length; k++){ const i = rising[k]; if (i === undefined) f[k].set(0, 0, 0, 0); else f[k].set(iA[i*4 + 2], iB[i*4], iC[i*2], 0); } if (rising.length){ const g = cloudPass.mat.uniforms; g.uSlotZ.value = iA[rising[0]*4 + 2]; g.uSlot.value = rising.length > 1 ? Math.max(20, iA[rising[1]*4 + 2] - iA[rising[0]*4 + 2]) : 45; } }
  // (the mist's wisps go with the mist: once the sun's light has reached her she is out in the clear)
  // (and in the dark of the two lost years they are fainter, or they stand out as pale shapes)
  if (cloudPass){ GLOW_MIST.value = cloudPass.mat.uniforms.uFog.value; updateSpill(GLOW_MIST.value, cloudPass.mat.uniforms.uAmbTop.value, tmp.z, (1 - smooth(u, JUMP + 1, JUMP + 4))*(1 - 0.6*mistAt(u))); }
  if (bloomPass) bloomPass.threshold = 0.60 + 0.28*smooth(dawn, 0.68, 1.0);   // the sunlit cloud may be bright without blooming
  uiAcc += dt0; if (uiAcc > 0.1){ updateUi(uiAcc); uiAcc = 0; updateToday(); }
  postFrame(t, W.frost);
  const q = gpuBegin();
  if (composer) composer.render(dt0); else renderer.render(scene, camera);
  gpuEnd(q);
}
function resize(){ camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); setPostSize(innerWidth, innerHeight); }
addEventListener('resize', resize); resize();

/* =====================================================================
   QUALITY — as in Voyage, it starts at the best on every device and steps down, never back up, only on one that cannot keep up: under about 22 frames a second, for two and
   a half seconds of them. First the pixel ratio with lighter multisampling and a smaller cloud image, then fewer cloud steps, no multisampling, and fewer wisps and less weather.
   A frame counts for at most a quarter second, so a hidden tab or a sleeping laptop does not take a step away.
   ===================================================================== */
let qLevel = 2, slowT = 0, qClock = 0;
function adaptQuality(raw: number){
  if (window.__fixedQuality) return;
  raw = Math.min(raw, 0.25);
  qClock += raw; if (qClock < 5) return;
  if (raw > 0.045) slowT += raw; else slowT = Math.max(0, slowT - raw*0.5);
  if (slowT > 2.5 && qLevel > 0){
    qLevel--; slowT = 0; qClock = 3;
    if (qLevel === 1){ setPR(Math.min(PR, PHONE ? 1.25 : 1)); setSamples(2); cloudPass?.setQuality(0.42, 48); }
    else { setPR(Math.min(PR, PHONE ? 0.85 : 1)); setSamples(0); cloudPass?.setQuality(0.34, 40); setSpillKeep(0.5); setAirKeep(0.4); }
    resize();
  }
}
Promise.all([birdReady, flockReady]).then(() => { updateUi(0); frame(); });
