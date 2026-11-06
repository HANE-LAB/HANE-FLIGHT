import { U } from './uniforms';
import { smooth } from './dom';
import { JUMP } from './data';
import { airOf,frostOf, moodsAt, rainNightAt, thunderAt, type Mood } from './climate';
import { pathX, mistAt, sAt } from './path';
import { reduceMotion } from './renderer';
import { clockAt } from './sequencer';

/* =====================================================================
   WEATHER STATE — what the sky is doing on the night she has reached: the climate of those years (src/climate.ts), and that night's
   real moon. A pure function of her day, like everything else (the one exception: lightning goes out at high speed, so a fast
   flight does not strobe). All of it gives way to the dawn.
   This module only says what the weather is. The sky (src/sky.ts), the cloud (src/clouds.ts), the gates and what is in the air
   (src/weather.ts) read it from W.
   ===================================================================== */
const DEG = Math.PI/180;
/** The Julian day of day 0 (2021-02-03) at 22:00 in Beijing, when she goes on. */
const JD0 = 2459248.5 + 14/24;
const Q = new URLSearchParams(location.search);
/** ?mood=warm holds one mood all the way along, to look at it. */
const FORCE = Q.get('mood') as Mood | null;

/** The weather now (updateSeason). Each mood 0 … 1, already faded by the dawn. */
export const W = {
  sprout: 0, warm: 0, clear: 0, storm: 0, cold: 0, thaw: 0,
  rain: 0,                    // how hard it rains, 0 … 1: with the storm, and on the nights the room was worried or hurt, even once the sun is up
  lit: 1,                    // how much of the moon's face is lit, 0 new … 1 full
  sinI: 0, cosI: 1,           // its phase angle: how the terminator lies (sky.frag.glsl). sinI > 0 waxing
  moon: 1,                    // how strong the moonlight is on the cloud
  steady: 1,                  // 1 she goes slowly enough for the moon's changes to be seen as changes; 0 so fast that they would flicker
  frost: 0,                   // how far the frost has grown on the lens, 0 … 1 (grade.frag.glsl)
  air: 0,                     // how warm the air is once the sun is up, 0 … 1: only what is in it
  flash: 0,                   // lightning now, 0 … about 1
  lead: 1,                    // how far the stepped leader has come, 0 … 1; 1 the return stroke
  boltX: 0, boltTop: 0, boltZ: 0,   // where it is: its foot on the floor of the cloud, how high it starts
  bolt: -1,                   // which strike, while a channel shows (src/weather.ts draws it); -1 none
  lent: 0,                    // 0 … 1: a strike asked for, whose cold light has stayed (see lend)
  nextBolt: 0,                // which strike comes next, whether or not it will strike
};

/* ---------- the moon: Meeus, Astronomical Algorithms ch. 48, the low-precision phase angle ---------- */
function moonAt(u: number){
  const T = (JD0 + u - 2451545)/36525, s = (a: number) => Math.sin(a*DEG);
  const D = 297.8501921 + 445267.1114034*T, M = 357.5291092 + 35999.0502909*T, Mp = 134.9633964 + 477198.8675055*T;
  const i = (180 - D - 6.289*s(Mp) + 2.100*s(M) - 1.274*s(2*D - Mp) - 0.658*s(2*D) - 0.214*s(2*Mp) - 0.110*s(D))*DEG;
  return { sinI: Math.sin(i), cosI: Math.cos(i), lit: (1 + Math.cos(i))/2 };
}

/* ---------- lightning: a chance of a strike every STEP days. Every strike's time, place and strength come from its number, so
   a seek or a pause finds the same bolt. It stays inside the three-flashes-a-second limit at the storm's pace: strikes at least
   0.6 s apart, and only every other one with a second stroke, so no second holds more than three. Few are dim, some great ---------- */
// (the chances go by the flight's own clock, not the days: she slows right down on the worst nights, and the sky does not wait for her)
const STEP = 1.05;
const hash = (k: number, n: number) => { const x = Math.sin(k*127.1 + n*311.7)*43758.5453; return x - Math.floor(x); };
// (x in seconds)
const stroke = (x: number) => x <= 0 ? 0 : (1 - Math.exp(-x/0.006))*Math.exp(-x/0.10);
// (how long before the stroke the leader sets out: a few frames)
const LEAD = 0.07;
function strike(u: number, rate: number){
  W.flash = 0; W.bolt = -1; W.lead = 1;
  const c = clockAt(u), k0 = Math.floor(c/STEP);
  W.nextBolt = k0 + 1;
  if (rate <= 0) return;
  for (let k = k0 - 1; k <= k0; k++){
    if (hash(k, 0) > rate) continue;
    const x = c - (k + 0.1 + 0.4*hash(k, 1))*STEP;
    if (x <= -LEAD || x > 0.55) continue;
    const h2 = hash(k, 2), f = x <= 0 ? 0 : (0.50 + 0.50*h2*h2)*Math.max(stroke(x), k%2 === 0 ? 0.8*stroke(x - 0.08) : 0);
    if (f < W.flash || (W.bolt >= 0 && f === 0)) continue;
    W.flash = f; W.lead = x <= 0 ? (x + LEAD)/LEAD : 1;
    // close, in the valley ahead of her, where it can be seen: it stays where it struck as she flies on
    const z = sAt(u) + 120 + 150*hash(k, 4) - 60*Math.max(0, x), side = hash(k, 5) < 0.5 ? -1 : 1;
    W.boltX = pathX(z) + side*(25 + 45*hash(k, 6)); W.boltTop = 150 + 70*hash(k, 7); W.boltZ = z;
    W.bolt = x < 0.45 ? k : -1;
  }
}

/** 日の目を見る, 0 night … 1 the sun is up. The night holds through all the long years, and the light comes with the people: the sky only starts to turn on the night they start to come, six nights before the count jumps (the room goes from 43 to 15970 in those six); on the night it jumps the sun breaks the horizon, and stays up. */
export const dawnAt = (u: number) => 0.72*smooth(u, JUMP - 6.5, JUMP) + 0.28*smooth(u, JUMP, JUMP + 15);

/* ---------- 借一道闪电: one real strike when the viewer asks, and then its cold light stays until it is given back, so that what only shows in the lightning can be read ---------- */
const LENT_FROM = 90000000;
let lending = false, lendAt = -1e9, lendN = 0, lastT = 0;
export function lend(on: boolean){
  lending = on;
  // (however fast the button is pressed, no more than the storm's own limit of strikes)
  if (on && U.uTime.value - lendAt > 0.7){ lendAt = U.uTime.value; lendN++; }
}

/** @param u her day; @param dawn 0 night … 1 the sun is up; @param pace days per second now */
export function updateSeason(u: number, dawn: number, pace: number){
  const on = 1 - smooth(dawn, 0.02, 0.40), m0 = moodsAt(u);
  for (const k of ['sprout', 'warm', 'clear', 'storm', 'cold', 'thaw'] as const) W[k] = (FORCE ? (FORCE === k ? 1 : 0) : m0[k])*(FORCE ? 1 : on);
  const m = moonAt(u); W.lit = m.lit; W.sinI = m.sinI; W.cosI = m.cosI;
  // the moonlight goes up and down with it; held at its mean when she goes so fast that it would flicker
  const steady = (1 - smooth(pace, 5, 9))*(1 - mistAt(u));
  W.moon = 0.86 + (0.56 + 0.54*Math.sqrt(m.lit) - 0.86)*steady;
  W.steady = 1 - smooth(pace, 5, 9);
  W.frost = frostOf(u); W.air = airOf(u);
  // (in the sunshine a worried night's rain is a sun shower: only the rain, not the dark)
  W.rain = FORCE ? W.storm : Math.max(W.storm, 0.62*rainNightAt(u));
  const thunder = FORCE === 'storm' ? 1 : FORCE ? 0 : thunderAt(u)*on;
  strike(u, 0.97*thunder);
  const calm = reduceMotion ? 0 : 1 - smooth(pace, 3, 5.5);
  W.flash *= calm*Math.min(1, 2*thunder); if (calm <= 0) W.bolt = -1;
  const t = U.uTime.value, x = t - lendAt, dt = Math.max(0, t - lastT); lastT = t;
  W.lent += ((lending ? 1 : 0) - W.lent)*(1 - Math.exp(-dt/(lending ? 0.16 : 0.34)));
  if (lending && !reduceMotion && x < 0.5){
    const f = 0.9*Math.max(stroke(x), 0.8*stroke(x - 0.08));
    if (f > W.flash){ W.flash = f; W.lead = 1; W.bolt = x < 0.45 ? LENT_FROM + lendN : -1; }
  }
}
