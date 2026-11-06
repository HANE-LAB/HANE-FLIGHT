import { JUMP, NG, SLOTS } from './data';
import { mulberry32, smooth } from './dom';
import { W, dawnAt, updateSeason } from './season';
import { REST, clockAt, paceNow, seq } from './sequencer';
import { PHASES, metresOf } from './climate';
import { keyed } from './key';

/* =====================================================================
   SOUND — the three pieces of music the film has, from OpenTracks (白の民話 by 秦暁, 雨情 by のる, Rising sun 開明 by 田中芳典), laid over
   the flight the way the film lays them, and under them the air: wind, rain, snow, thunder, and a breath of wind at each gate.
     the tale    白の民話 from the start: quiet for 40 s, it fills out as the warm years come (0:35 at the usual pace); its own quiet middle
                 (3:36 to 4:00 of it) falls in the storm, and it stops there, before its last part
     the rain    雨情 from the end of the storm (2022-11-08) to the dawn (2026-10-06)
     the sun     Rising sun 開明 from the dawn to today, its loudest stretch (from 1:31) on the sunrise
     today       the last part of 白の民話 (from 3:55) as she comes to rest, as the film ends; then, while she waits, 白の民話 from the top.
                 Opened at today, the page begins with that
   Where each piece is follows where she is (clockAt: when the flight gets there at the usual pace, scaled by the speed she is going), so a
   jump lands where the piece would be; the piece only changes when the stretch does. Stopped, the music goes on quietly; in the worst of
   the storm and in a lightning asked for it draws back.
   The pieces are not files anyone can take, as OpenTracks asks: each comes as a few scripts in public/sound/ holding its bytes under a
   key stream (src/key.ts, dev/music.mjs), undone here in memory and played through Web Audio. The first part is its first twelve seconds
   and each after it about twice the one before: on a slow line the music starts once the first has come, and as more comes what has come
   is decoded again and takes over from the shorter, sample for sample. Nothing loads and nothing starts until the viewer has touched the
   page with the sound on, as browsers ask. An iPhone silences what a page plays this way with the switch on its side, as it does a
   ringtone, unless the page says it is playing, as a video does: so it says so.
   ?sound writes on the page how the sound stands, for a phone, which has no console.
   ===================================================================== */
type Id = 'a' | 'b' | 'c';
type Kind = 'tale' | 'rain' | 'sun' | 'end' | 'again';
/** What of its piece each plays (seconds), how loud, and how it comes and goes: fadeIn when it starts partway, fadeOut when it is cut
 *  off, tail where its stretch ends of itself. */
const KIND: Record<Kind, { id: Id; from: number; to: number; gain: number; fadeIn: number; fadeOut: number; tail: number }> = {
  // (up to its quiet middle: the last part is kept for today)
  tale: { id: 'a', from: 0, to: 238, gain: 1, fadeIn: 2, fadeOut: 2.5, tail: 2.5 },
  // (the cold years a little under the rest, as the score had them)
  rain: { id: 'b', from: 0, to: 241, gain: 0.84, fadeIn: 2.5, fadeOut: 3, tail: 1 },
  // (the film had it 5 dB up, under the voice)
  sun: { id: 'c', from: 0, to: 166, gain: 1.19, fadeIn: 2.5, fadeOut: 3.5, tail: 1 },
  end: { id: 'a', from: 235, to: 276, gain: 1.12, fadeIn: 3.5, fadeOut: 2, tail: 0.5 },
  again: { id: 'a', from: 0, to: 276, gain: 0.85, fadeIn: 2, fadeOut: 2, tail: 0.5 },
};
/** The second of Rising sun 開明 that falls on the sunrise. */
const SUN_AT = 96;
/** The pieces are made −20 LUFS (dev/music.mjs); this brings them out at about −21 LUFS, where the old score was, their peaks under the limiter. */
const MUSIC = 1.6;
const AFTER = PHASES.find(p => p.mood === 'storm' && p.amount)!.from, DAWN = PHASES.find(p => p.mood === 'dawn')!.from;
/** Today's music comes in this far before she gets there, 2.5 s at the usual pace, as in the film. */
const ARRIVE = (() => { let lo = DAWN, hi = REST; for (let i = 0; i < 40; i++){ const m = (lo + hi)/2; if (clockAt(REST) - clockAt(m) > 2.5) lo = m; else hi = m; } return hi; })();
type Zone = 'tale' | 'rain' | 'sun' | 'today';
const zoneAt = (u: number): Zone => u >= ARRIVE ? 'today' : u >= DAWN ? 'sun' : u >= AFTER ? 'rain' : 'tale';
/** Where in its piece the music would be at u, had she flown there at this many times the usual pace. */
function placeOf(kind: Kind, u: number, rate: number){
  if (kind === 'tale') return clockAt(u)/rate;
  if (kind === 'rain') return (clockAt(u) - clockAt(AFTER))/rate;
  if (kind === 'sun') return SUN_AT + (clockAt(u) - clockAt(JUMP))/rate;
  return KIND[kind].from;
}

/* ---------- the pieces, a part at a time: public/sound/<id><n>.js hands flightSound its bytes, how many parts there are, and how far into
   the piece the parts up to it reach ---------- */
type Coming = { bytes: Uint8Array; n: number; of: number; upTo: number; next: Promise<void> | null; since: number; wake: (() => void) | null };
const coming = new Map<Id, Coming>(), handed = new Map<string, (n: number, of: number, upTo: number, text: string) => void>();
(window as unknown as { flightSound: (id: Id, n: number, of: number, upTo: number, text: string) => void }).flightSound = (id, n, of, upTo, text) => handed.get(id + n)?.(n, of, upTo, text);
function comingOf(id: Id){
  let c = coming.get(id);
  if (!c) coming.set(id, c = { bytes: new Uint8Array(0), n: 0, of: 1, upTo: 0, next: null, since: 0, wake: null });
  return c;
}
/** Its next part, undone and put after what has come (one part at a time, however many ask). */
function more(id: Id){
  const c = comingOf(id);
  return c.next ??= new Promise<void>((ok, fail) => {
    const key = id + c.n, s = document.createElement('script');
    // (loaded but nothing handed over counts as lost too)
    const lost = () => { s.remove(); if (handed.delete(key)) fail(new Error(`sound/${key}.js`)); };
    handed.set(key, (n, of, upTo, text) => {
      handed.delete(key);
      const bin = atob(text), at = c.bytes.length, b = new Uint8Array(at + bin.length);
      b.set(c.bytes);
      for (let i = 0; i < bin.length; i++) b[at + i] = bin.charCodeAt(i);
      keyed(b.subarray(at), id, at);
      c.bytes = b; c.n = n + 1; c.of = of; c.upTo = upTo;
      ok(); c.wake?.();
    });
    c.since = performance.now();
    s.src = `sound/${key}.js`; s.async = true; s.onload = s.onerror = lost;
    document.head.append(s);
  }).finally(() => { c.next = null; });
}
/** Decoded at 32 kHz, which keeps all the MP3 has of them and takes a third less memory than 48 kHz (a piece is still up to 72 MB);
 *  where an off-line context at that rate is not to be had, at the rate of the one given. */
let at32: BaseAudioContext | null = null;
function decode(ctx: BaseAudioContext, bytes: Uint8Array){
  if (!at32){ try { at32 = new OfflineAudioContext(2, 1, 32000); } catch { at32 = ctx; } }
  const c = at32;
  return new Promise<AudioBuffer>((ok, fail) => { c.decodeAudioData(bytes.slice().buffer, ok, fail)?.catch(fail); });
}

function noiseBuffer(ctx: BaseAudioContext, seconds: number){
  const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate*seconds), ctx.sampleRate), d = b.getChannelData(0), r = mulberry32(77);
  let brown = 0;
  for (let i = 0; i < d.length; i++){ const w = r()*2 - 1; brown = (brown + 0.03*w)/1.03; d[i] = 0.55*w + 3.2*brown; }
  // (the loop's two ends meet)
  const n = Math.min(4000, d.length >> 1); for (let i = 0; i < n; i++){ const k = i/n; d[i] = d[i]*k + d[d.length - n + i]*(1 - k); }
  return b;
}
/** A shrine hall of cedar: a little gap, and then a tail that darkens as it goes. */
function hallBuffer(ctx: BaseAudioContext, seconds: number){
  const n = Math.floor(ctx.sampleRate*seconds), b = ctx.createBuffer(2, n, ctx.sampleRate), r = mulberry32(5), gap = Math.floor(ctx.sampleRate*0.028);
  for (let c = 0; c < 2; c++){
    const d = b.getChannelData(c); let lp = 0;
    for (let i = gap; i < n; i++){ const t = (i - gap)/(n - gap), a = Math.pow(1 - t, 2.8), k = 0.62 - 0.5*Math.sqrt(t); lp += k*((r()*2 - 1) - lp); d[i] = lp*a; }
  }
  return b;
}

/** A piece decoded, all of it or as far as it has come: upTo is how many seconds of it are good (Infinity: all). */
type Piece = { buf: AudioBuffer; upTo: number };
/** A piece sounding: src through g (its own, for where what has come runs out) through level (how loud this kind of it is, and its
 *  coming in) through out (its going); zero is when its own second 0 would have been, start when it begins to sound. */
type Voice = { kind: Kind; id: Id; src: AudioBufferSourceNode; g: GainNode; level: GainNode; out: GainNode; zero: number; start: number; end: number; leaving: boolean; gone: number };

class Engine {
  out: GainNode; private dry: GainNode; private wet: GainNode; private music: GainNode;
  private noise: AudioBuffer;
  private wind: GainNode; private windTone: BiquadFilterNode; private rain: GainNode; private rumble: GainNode; private hush: GainNode;
  private r = mulberry32(2021);
  private lastU = -1; private gate = 0; private lastThunder = -9; private lastBolt = -1;
  // the music: what is sounding, the pieces decoded, and where things stand
  private voices: Voice[] = []; private pieces = new Map<Id, Piece>(); private loading = new Set<Id>(); private missed = new Map<Id, number>();
  private zone: Zone | null = null; private zoneFrom = 0; private spent = false; private restEnded: number | null = null; private heard = false; private rate = 1; private landed: number | null = null;
  /** (test only) what was played */
  log: string[] | null = null;

  /** load: how to get a piece, handing over each time more of it has come and been decoded, and done when all of it has (null: only the
   *  pieces given). */
  constructor(private ctx: BaseAudioContext, private load: ((id: Id, take: (buf: AudioBuffer, upTo: number) => void) => Promise<void>) | null, given?: Map<Id, AudioBuffer>){
    if (given) for (const [id, buf] of given) this.pieces.set(id, { buf, upTo: Infinity });
    const limit = ctx.createDynamicsCompressor(); limit.threshold.value = -5; limit.knee.value = 3; limit.ratio.value = 20; limit.attack.value = 0.002; limit.release.value = 0.12; limit.connect(ctx.destination);
    this.out = ctx.createGain(); this.out.gain.value = 0; this.out.connect(limit);
    // the air goes through a compressor of its own and a floor; the music, as it was mastered, only through the limiter
    const master = ctx.createDynamicsCompressor(); master.threshold.value = -16; master.ratio.value = 2.5; master.attack.value = 0.008; master.release.value = 0.35; master.connect(this.out);
    const floor = ctx.createBiquadFilter(); floor.type = 'highpass'; floor.frequency.value = 38; floor.Q.value = 0.6; floor.connect(master);
    this.dry = ctx.createGain(); this.dry.connect(floor);
    const hall = ctx.createConvolver(); hall.buffer = hallBuffer(ctx, 2.7);
    this.wet = ctx.createGain(); this.wet.connect(hall); const wetOut = ctx.createGain(); wetOut.gain.value = 0.85; const clean = ctx.createBiquadFilter(); clean.type = 'highpass'; clean.frequency.value = 130; hall.connect(clean); clean.connect(wetOut); wetOut.connect(floor);
    this.music = ctx.createGain(); this.music.gain.value = MUSIC; this.music.connect(this.out);
    this.noise = noiseBuffer(ctx, 5);
    // the air, thinned out, under the music
    const bed = (type: BiquadFilterType, fq: number, q: number, send = 0.2) => {
      const s = ctx.createBufferSource(); s.buffer = this.noise; s.loop = true; s.loopEnd = 5; s.playbackRate.value = 0.97 + 0.06*this.r();
      const t = ctx.createBiquadFilter(); t.type = type; t.frequency.value = fq; t.Q.value = q;
      const g = ctx.createGain(); g.gain.value = 0; s.connect(t); t.connect(g); g.connect(this.dry);
      const w = ctx.createGain(); w.gain.value = send; g.connect(w); w.connect(this.wet);
      s.start(0, 5*this.r());
      return { g, t };
    };
    const a = bed('bandpass', 420, 0.7); this.wind = a.g; this.windTone = a.t;
    this.rain = bed('highpass', 1300, 0.3, 0.1).g;
    this.rumble = bed('lowpass', 110, 0.5, 0.05).g;
    this.hush = bed('highpass', 5200, 0.3, 0.3).g;
  }
  private level(p: AudioParam, v: number, when: number, tc = 0.5){ p.setTargetAtTime(v, when, tc); }

  /* ---------- the air ---------- */
  private whoosh(when: number, vel: number){
    const ctx = this.ctx, n = ctx.createBufferSource(), t = ctx.createBiquadFilter(), g = ctx.createGain();
    n.buffer = this.noise; t.type = 'bandpass'; t.Q.value = 1.1; t.frequency.setValueAtTime(380, when); t.frequency.exponentialRampToValueAtTime(900, when + 0.12); t.frequency.exponentialRampToValueAtTime(300, when + 0.42);
    g.gain.setValueAtTime(0.0001, when); g.gain.exponentialRampToValueAtTime(vel, when + 0.11); g.gain.exponentialRampToValueAtTime(0.0002, when + 0.45);
    const p = ctx.createStereoPanner(); p.pan.setValueAtTime(this.r() < 0.5 ? -0.5 : 0.5, when);
    n.connect(t); t.connect(g); g.connect(p); p.connect(this.dry); n.start(when, 5*this.r(), 0.5);
  }
  private thunder(when: number, strength: number, loud: number){
    const ctx = this.ctx, n = ctx.createBufferSource(), t = ctx.createBiquadFilter(), g = ctx.createGain(), ring = 1.6 + 1.6*strength;
    n.buffer = this.noise; n.loop = true; t.type = 'lowpass'; t.frequency.setValueAtTime(420 + 300*strength, when); t.frequency.exponentialRampToValueAtTime(90, when + ring);
    g.gain.setValueAtTime(0.0001, when); g.gain.exponentialRampToValueAtTime(0.34*strength*loud, when + 0.07 + 0.1*this.r()); g.gain.exponentialRampToValueAtTime(0.0002, when + ring);
    n.connect(t); t.connect(g); g.connect(this.dry); const s = ctx.createGain(); s.gain.value = 0.4; g.connect(s); s.connect(this.wet); n.start(when, 5*this.r()); n.stop(when + ring + 0.1);
  }

  /* ---------- the music ---------- */
  /** A piece decoded, all of it or as far as it has come, or null; and while not all of it is here it is asked for (again after ten
   *  seconds, if a part could not be had). */
  private piece(id: Id){
    const p = this.pieces.get(id);
    if (p){ this.pieces.delete(id); this.pieces.set(id, p); }
    const missed = this.missed.get(id);
    if ((!p || p.upTo < Infinity) && this.load && !this.loading.has(id) && !(missed !== undefined && this.ctx.currentTime - missed < 10)){
      this.loading.add(id);
      this.load(id, (buf, upTo) => this.take(id, buf, upTo)).then(() => { this.missed.delete(id); }, () => { this.missed.set(id, this.ctx.currentTime); }).finally(() => this.loading.delete(id));
    }
    return p ?? null;
  }
  /** More of a piece has come, or all of it: what is sounding from less of it goes over to this where it is. Still within what it had,
   *  the two are the same sample for sample there, so it goes straight over; past it, where it had gone quiet, it comes back in. */
  private take(id: Id, buf: AudioBuffer, upTo: number){
    const old = this.pieces.get(id);
    if (old && old.upTo >= upTo) return;
    const p = { buf, upTo };
    this.pieces.delete(id); this.pieces.set(id, p);
    for (const v of this.voices){
      // (from now, or from when it was to begin, if that is still to come)
      const t = Math.max(this.ctx.currentTime + 0.05, v.start);
      if (v.id !== id || v.leaving || t >= v.end || t - v.zero > upTo - 2) continue;
      const straight = !!old && t - v.zero < old.upTo - 0.1;
      v.src.stop(t); this.feed(v, p, t, straight ? 0 : 1.5);
      this.log?.push(`${t.toFixed(2)} ${v.kind} goes on with ${upTo < Infinity ? `${upTo.toFixed(0)} s` : 'all'} of it at ${(t - v.zero).toFixed(1)}`);
    }
    this.keepTwo(id);
  }
  /** Where a kind of it ends: its own end, or the piece's if that comes first (not known until all of it has come). */
  private top(kind: Kind, p: Piece){ const k = KIND[kind]; return p.upTo < Infinity ? k.to : Math.min(k.to, p.buf.duration); }
  /** A voice plays this piece from t on, where it is by then; it comes in over fadeIn, and goes quiet where what has come runs out. */
  private feed(v: Voice, p: Piece, t: number, fadeIn: number){
    const src = this.ctx.createBufferSource(), g = this.ctx.createGain();
    src.buffer = p.buf; src.connect(g); g.connect(v.level);
    if (fadeIn > 0){ g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + fadeIn); }
    if (p.upTo < Infinity){ const edge = Math.max(v.zero + p.upTo, t + fadeIn + 0.1); g.gain.setValueAtTime(1, edge - 0.08); g.gain.linearRampToValueAtTime(0, edge); }
    src.start(t, t - v.zero);
    v.src = src; v.g = g; v.end = v.zero + this.top(v.kind, p);
  }
  /** No more than two pieces kept decoded (the longest least lately wanted goes first), never one that is sounding, has just come or
   *  was the last wanted. */
  private keepTwo(fresh?: Id){
    if (!this.load) return;
    const ids = [...this.pieces.keys()], last = ids[ids.length - 1];
    for (const id of ids) if (this.pieces.size > 2 && id !== fresh && id !== last && !this.voices.some(v => v.id === id)) this.pieces.delete(id);
  }
  private begin(kind: Kind, at: number, when: number, fade: number){
    const k = KIND[kind], p = this.pieces.get(k.id)!, ctx = this.ctx, level = ctx.createGain(), out = ctx.createGain();
    level.gain.setValueAtTime(0, when); level.gain.linearRampToValueAtTime(k.gain, when + fade);
    level.connect(out); out.connect(this.music);
    const v = { kind, id: k.id, level, out, zero: when - at, start: when, end: 0, leaving: false, gone: Infinity } as Voice;
    this.feed(v, p, when, 0);
    this.voices.push(v);
    if (kind === 'tale' || kind === 'rain' || kind === 'sun') this.heard = true;
    this.log?.push(`${when.toFixed(2)} ${kind} from ${at.toFixed(1)}`);
  }
  private leave(v: Voice, at: number, fade: number){
    v.leaving = true; v.gone = at + fade + 0.1;
    v.out.gain.setValueAtTime(1, at); v.out.gain.linearRampToValueAtTime(0, at + fade); v.src.stop(at + fade + 0.05);
    this.log?.push(`${at.toFixed(2)} ${v.kind} goes at ${(at - v.zero).toFixed(1)}`);
  }
  /** Which music should be sounding where she is, and see that it is. */
  private direct(when: number, u: number){
    const zone = zoneAt(u);
    if (zone !== this.zone){ this.zone = zone; this.zoneFrom = when; this.spent = false; this.restEnded = null; this.log?.push(`${when.toFixed(2)} into ${zone}`); }
    // a stretch that has come to its end fades of itself
    for (const v of this.voices) if (!v.leaving && when + 0.2 >= v.end - KIND[v.kind].tail){
      this.leave(v, Math.max(when, v.end - KIND[v.kind].tail), KIND[v.kind].tail);
      if (v.kind === 'end' || v.kind === 'again') this.restEnded = v.end;
    }
    this.voices = this.voices.filter(v => v.gone > when);
    this.keepTwo();
    const voice = this.voices.find(v => !v.leaving) ?? null;
    // the next piece, in time for when it is wanted
    const soon = (d: number) => (clockAt(d) - clockAt(u))/this.rate < 40;
    if (zone === 'tale' && soon(AFTER)) this.piece('b');
    if (zone === 'rain' && soon(DAWN)) this.piece('c');
    if (zone === 'sun' && soon(ARRIVE)) this.piece('a');
    // what should be sounding: today's music is the ending if she has flown here, 白の民話 from the top if not, and after a breath of quiet
    // 白の民話 from the top again
    const rest = (): Kind | null => this.restEnded === null ? (this.heard ? 'end' : 'again') : when >= this.restEnded + 6 ? 'again' : null;
    let want: Kind | null;
    if (voice && (voice.kind === 'end' || voice.kind === 'again') && (zone === 'today' || this.spent)) want = voice.kind;
    else if (zone === 'today') want = rest();
    else if (this.spent) want = zone === 'sun' ? rest() : null;
    else {
      want = zone;
      // (its piece has run out before the stretch has: after the sun comes today's music, after the others quiet until the next stretch)
      if (voice?.kind !== zone && placeOf(zone, u, this.rate) > KIND[zone].to - 8){ this.spent = true; want = zone === 'sun' ? rest() : null; }
    }
    // a jump within the stretch, once she has settled: if the piece is far from where it would be here, it goes there
    if (voice && want === voice.kind && this.landed !== null && when >= this.landed){
      this.landed = null;
      const now = when - voice.zero, at = placeOf(want, u, this.rate), k = KIND[want];
      if ((want === 'tale' || want === 'rain' || want === 'sun') && Math.abs(now - at) > 20){
        this.leave(voice, when, k.fadeOut);
        if (at > k.to - 8){ this.spent = true; return; }
        // (if that much of it has not come yet, it starts there once it has)
        const p = this.pieces.get(k.id);
        if (p && Math.max(k.from, at) < p.upTo - 4) this.begin(want, Math.max(k.from, at), when + 0.05, k.fadeIn);
        return;
      }
    }
    // (a jump may be one of several: it waits for her to settle)
    if (want === (voice?.kind ?? null) || when - this.zoneFrom < 0.25) return;
    if (!want){ if (voice) this.leave(voice, when, KIND[voice.kind].fadeOut); return; }
    const k = KIND[want], p = this.piece(k.id);
    // (not here yet: what is sounding goes on until it is)
    if (!p) return;
    const top = this.top(want, p), at = Math.max(k.from, Math.min(placeOf(want, u, this.rate), top - 8));
    // the same piece near enough the same place goes on as it is, under its new name
    if (voice && voice.id === k.id){
      const now = when - voice.zero;
      if (Math.abs(now - at) < 15 && now >= k.from && now < k.to - 8){
        voice.kind = want; voice.end = voice.zero + top; voice.level.gain.setTargetAtTime(k.gain, when, 0.5);
        if (want === 'tale' || want === 'rain' || want === 'sun') this.heard = true;
        this.log?.push(`${when.toFixed(2)} goes on as ${want} at ${now.toFixed(1)}`);
        return;
      }
    }
    // (only the start of it has come, not as far as this: what is sounding goes on until it has)
    if (at > p.upTo - 4) return;
    const fresh = k.from === 0 && at < 0.5;
    if (voice) this.leave(voice, when, KIND[voice.kind].fadeOut);
    // (a piece from its own beginning comes in out of the quiet, once the last has mostly gone)
    this.begin(want, at, when + (fresh && voice ? 0.6*KIND[voice.kind].fadeOut : 0.05), fresh ? 0.3 : k.fadeIn);
  }
  /** (for the console: __dbg.sound) */
  state(){
    const t = this.ctx.currentTime;
    return { zone: this.zone, rate: +this.rate.toFixed(2), decoded: [...this.pieces].map(([id, p]) => p.upTo < Infinity ? `${id} to ${p.upTo.toFixed(0)} s` : id), voices: this.voices.map(v => `${v.kind} ${(t - v.zero).toFixed(1)}${v.leaving ? ' going' : ''}`) };
  }

  /** Every so often: bring it all to where she is. */
  tick(when: number, u: number, dt: number, playing: boolean, film: boolean, gain: number){
    const sun = smooth(dawnAt(u), 0.35, 0.8), waiting = u >= REST - 0.01, fierce = smooth(W.storm, 0.6, 0.95);
    // the air, under the music; in the worst of the storm the music draws back and the rain and the thunder come up
    this.level(this.wind.gain, 0.012 + 0.052*W.cold + 0.014*W.warm + 0.09*W.storm + 0.008*W.clear + 0.012*sun, when);
    this.level(this.windTone.frequency, 340 + 260*W.storm + 180*W.cold + 120*Math.sin(when*0.23), when, 1.4);
    this.level(this.rain.gain, 0.14*W.rain*(1 + 0.6*fierce), when);
    this.level(this.rumble.gain, 0.14*W.storm*(1 + 0.6*fierce), when, 1);
    this.level(this.hush.gain, 0.009*W.cold, when);
    this.level(this.out.gain, film ? 0 : gain, when, 0.8);
    // (in a lightning asked for, everything draws back)
    this.level(this.dry.gain, 1 - 0.5*W.lent, when, 0.3); this.level(this.wet.gain, 1 - 0.4*W.lent, when, 0.3);
    // (the music: further back in a lightning asked for; stopped, it goes on quietly)
    this.level(this.music.gain, MUSIC*(1 - 0.55*fierce)*(1 - 0.6*W.lent)*(playing || waiting ? 1 : 0.4), when, 0.6);
    // the thunder comes a moment after the flash
    if (W.flash > 0.22 && W.bolt !== this.lastBolt && when - this.lastThunder > 1.3){ this.lastThunder = when; this.lastBolt = W.bolt; this.thunder(when + 0.12 + 0.5*this.r(), Math.min(1, W.flash), 1 + 0.4*fierce); }
    const moved = u - this.lastU, jumped = this.lastU >= 0 && Math.abs(moved) > Math.max(0.4, paceNow(u)*dt*8);
    // (how fast she is going, against the usual pace)
    if (playing && this.lastU >= 0 && !jumped && moved > 0 && dt > 0) this.rate += (Math.min(6, Math.max(0.25, moved/(Math.max(1e-3, paceNow(u))*dt))) - this.rate)*0.3;
    if (jumped) this.landed = when + 0.25;
    this.direct(when, u);
    // the gates she has come through, a breath of wind each; not on a jump
    if (playing && this.lastU >= 0 && moved > 0 && !jumped){
      while (this.gate < NG && SLOTS[this.gate].day <= u){
        if (SLOTS[this.gate].day > this.lastU) this.whoosh(when + 0.02, 0.012 + 0.03*Math.min(1, paceNow(u)*metresOf(u)/75));
        this.gate++;
      }
    } else {
      let lo = 0, hi = NG; while (lo < hi){ const m = (lo + hi) >> 1; if (SLOTS[m].day <= u) lo = m + 1; else hi = m; } this.gate = lo;
    }
    this.lastU = u;
  }
}

/* ---------- the live one ---------- */
const KEY = 'flight-sound', LEVEL = 0.58;
let want = (() => { try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; } })();
let ctx: AudioContext | null = null, engine: Engine | null = null, step = 0;
export const soundOn = () => want;
/** (for the console) */
export const soundState = () => engine?.state() ?? null;
/** (Safari 16.4 on: 'playback' is what a video is, which the switch on an iPhone's side does not silence) */
const session = () => (navigator as unknown as { audioSession?: { type: string } }).audioSession;
const SHOW = new URLSearchParams(location.search).has('sound'), news = new Map<Id, string>();
const told = (id: Id, what: string) => { if (SHOW) news.set(id, what); };
const why = (e: unknown) => e instanceof Error ? `${e.name} ${e.message}` : String(e);
/** The piece last asked for, and those whose parts are still being fetched. */
let lead: Id | null = null;
const fetching = new Set<Id>();
/** A piece as it comes: its parts come one after another, and meanwhile what has come is decoded, the latest of it each time, and handed
 *  to take with how many seconds of it are good; done once all of it has been (with ?sound, how far it got). */
async function fetchPiece(c: BaseAudioContext, id: Id, take: (buf: AudioBuffer, upTo: number) => void){
  const p = comingOf(id);
  let done = false, lost: unknown = null;
  lead = id; fetching.add(id);
  void (async () => {
    while (p.n < p.of){
      // (on a slow line one piece at a time: the one last asked for comes first, and the others wait between their parts)
      for (let l = lead; l !== id && l && fetching.has(l); l = lead) await new Promise(r => setTimeout(r, 400));
      await more(id);
    }
  })().catch(e => { lost = e; told(id, `failed: ${why(e)}`); }).finally(() => { done = true; fetching.delete(id); p.wake?.(); });
  for (let shown = 0;;){
    if (p.n > shown){
      const n = p.n, whole = n >= p.of, upTo = whole ? Infinity : p.upTo - 1;
      try { take(await decode(c, p.bytes), upTo); }
      catch (e){ told(id, `failed: ${why(e)}`); throw e; }
      shown = n;
      told(id, whole ? 'all here' : `${n}/${p.of} here`);
      if (whole) return;
    }
    else if (done) throw lost ?? new Error(`sound/${id}`);
    else await new Promise<void>(ok => { p.wake = () => { p.wake = null; ok(); }; });
  }
}
function wake(){
  if (!want) return;
  const s = session();
  if (s && s.type !== 'playback') try { s.type = 'playback'; } catch { /* left as it was */ }
  if (!ctx){
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const c = new AC({ latencyHint: 'playback' });
    ctx = c; engine = new Engine(c, (id, take) => fetchPiece(c, id, take));
    if (SHOW) engine.log = [];
  }
  // (stopped by the page, or on an iPhone 'interrupted', by a call or by another app taking the sound)
  if (ctx.state !== 'running' && ctx.state !== 'closed') void ctx.resume();
}
export function setSound(on: boolean){
  want = on;
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* it just will not be remembered */ }
  if (on) wake();
  else if (ctx && engine){ engine.out.gain.setTargetAtTime(0, ctx.currentTime, 0.25); const c = ctx; setTimeout(() => { if (!want) void c.suspend(); }, 900); }
}
// browsers only let sound start from something the viewer did
for (const ev of ['pointerup', 'keydown', 'touchend', 'click'] as const) addEventListener(ev, wake, { capture: true, passive: true });
document.addEventListener('visibilitychange', () => { if (!ctx) return; if (document.hidden) void ctx.suspend(); else if (want) void ctx.resume(); });
/** Per frame; it only does anything ten times a second. */
export function updateSound(u: number, dt: number){
  if (!engine || !ctx || !want || ctx.state !== 'running') return;
  step += dt; if (step < 0.1) return;
  engine.tick(ctx.currentTime + 0.03, u, step, seq.playing && u < REST - 0.01, seq.film, LEVEL);
  step = 0;
}
// (?sound: how it stands, twice a second, in the top corner away from the date)
if (SHOW){
  const pre = document.createElement('pre');
  pre.style.cssText = 'position:fixed;right:6px;top:max(6px,env(safe-area-inset-top));z-index:9;margin:0;padding:6px 8px;font:12px/1.5 ui-monospace,Menlo,monospace;color:#fff;background:#000b;pointer-events:none;white-space:pre-wrap;max-width:calc(100vw - 12px)';
  document.body.append(pre);
  setInterval(() => {
    const t = engine?.state(), lines = [`sound ${want ? 'on' : 'off'}, session ${session()?.type ?? 'none'}`,
      ctx ? `context ${ctx.state}, ${ctx.sampleRate} Hz, ${ctx.currentTime.toFixed(1)} s` : 'no context yet: touch the page'];
    for (const id of ['a', 'b', 'c'] as Id[]){
      const p = coming.get(id);
      lines.push(`${id} ${p ? `${(p.bytes.length/1e6).toFixed(2)} MB${p.next ? `, part ${p.n + 1}/${p.n ? p.of : '?'} coming ${((performance.now() - p.since)/1000).toFixed(0)} s` : ''}` : '-'}${news.has(id) ? `, ${news.get(id)}` : ''}`);
    }
    if (t) lines.push(`${t.zone}, x${t.rate}, decoded ${t.decoded.join(', ') || '-'}`, `playing ${t.voices.join(', ') || '-'}`);
    // (and the last few things the music did)
    const log = engine?.log;
    if (log){ log.splice(0, log.length - 5); lines.push(...log); }
    pre.textContent = lines.join('\n');
  }, 500);
}

/* ---------- (test only, dev/film.mjs: the same sound for a stretch of flight at the usual pace, rendered off line, as 16-bit stereo WAV in base64; a low rate for a long stretch, to follow what the music does) ---------- */
if (window.__frameByFrame) window.__renderSound = async (from: number, seconds: number, rate = 44100) => {
  const off = new OfflineAudioContext(2, Math.ceil(rate*seconds), rate), given = new Map<Id, AudioBuffer>();
  for (const id of ['a', 'b', 'c'] as Id[]){ try { const p = comingOf(id); while (p.n < p.of) await more(id); given.set(id, await decode(off, p.bytes)); } catch { /* without that piece */ } }
  const e = new Engine(off, null, given);
  e.log = [`pieces ${[...given.keys()].join(' ')}`];
  let u = from;
  for (let t = 0; t < seconds; t += 0.05){
    const dawn = dawnAt(u), pace = paceNow(u);
    updateSeason(u, dawn, pace);
    e.tick(t, u, 0.05, u < REST - 0.01, false, LEVEL);
    u = Math.min(REST, u + pace*0.05);
  }
  const b = await off.startRendering(), L = b.getChannelData(0), R = b.getChannelData(1), n = L.length, w = new DataView(new ArrayBuffer(44 + n*4));
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) w.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); w.setUint32(4, 36 + n*4, true); str(8, 'WAVEfmt '); w.setUint32(16, 16, true); w.setUint16(20, 1, true); w.setUint16(22, 2, true); w.setUint32(24, rate, true); w.setUint32(28, rate*4, true); w.setUint16(32, 4, true); w.setUint16(34, 16, true); str(36, 'data'); w.setUint32(40, n*4, true);
  let peak = 0, sum = 0;
  for (let i = 0; i < n; i++){ const l = Math.max(-1, Math.min(1, L[i])), r = Math.max(-1, Math.min(1, R[i])); peak = Math.max(peak, Math.abs(l), Math.abs(r)); sum += l*l + r*r; w.setInt16(44 + i*4, l*32767, true); w.setInt16(46 + i*4, r*32767, true); }
  const bytes = new Uint8Array(w.buffer); let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { wav: btoa(bin), peak, rms: Math.sqrt(sum/(2*n)), log: e.log };
};
