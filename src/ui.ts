import { $, clamp } from './dom';
import { GHOSTS, NG, NIGHTS, SLOTS, SPECIAL_DAYS } from './data';
import { dayText, monthText, yearText } from './plaque';
import { USUAL, beatOf, hiddenOn, saidOn, soulsOf, voiceOf, type Said } from './voices';
import { bigAt, endDay, seq } from './sequencer';
import { reader, readGate, setReadFace, stopReading } from './camera';
import { iC } from './gates';
import { lendFlash } from './weather';
import { downHtml, writeDown } from './down';
import { reduceMotion, setMotion } from './renderer';
import { soundOn, setSound } from './sound';

/* =====================================================================
   THE PAGE'S OWN LAYER. The left is hers: the night, written as its plaque is, and her call hanging under it. The right is the answer: what that
   night said, only the lines the author has read (src/voices.ts), the newest on the right. Along the belt a cord of jewels, one for each gate, as big as the crowd that night and the colour of what the room felt,
   which is also the timeline. 寻声 finds nights by feeling: the four souls of the old belief, as four jewels.
   All of it is read from where she is; it writes nothing to the scene but a seek.
   ===================================================================== */
export type Controls = {
  go(day: number): void;
  /** Fly into that night's gate and stop in front of it. */
  flyTo(day: number): void;
  /** One step through the speeds; says which it is now. */
  stepSpeed(): string;
  /** The way the viewer last left it. */
  speedLabel(): string;
};

const dateY = $('dateY'), dateD = $('dateD'), nth = $('nth'), call = $('call'), callText = $('callText'), said = $('said'), tally = $('tally'), reading = $('reading');
const ui = $('ui'), cordWrap = $('cordWrap'), mark = $('mark'), timeline = $<HTMLInputElement>('timeline'), cord = $<HTMLCanvasElement>('cord');
const seekPanel = $('seek'), seekBtn = $('seekBtn'), soulsBox = $('souls'), seekGo = $('seekGo'), seekAt = $('seekAt');
const DIGIT = '零一二三四五六七八九';
/** A number as it is read out, for writing down the page: 15970 is 一万五千九百七十. */
function kan(n: number){
  const under = (x: number) => {
    const q = Math.floor(x/1000), h = Math.floor(x/100)%10, t = Math.floor(x/10)%10, o = x%10;
    let s = q ? DIGIT[q] + '千' : '';
    if (h) s += DIGIT[h] + '百'; else if (q && (t || o)) s += '零';
    if (t) s += (t === 1 && !q && !h ? '' : DIGIT[t]) + '十'; else if (h && o) s += '零';
    return s + (o ? DIGIT[o] : '');
  };
  const w = Math.floor(n/10000), r = n%10000;
  return n ? (w ? under(w) + '万' + (r && r < 1000 ? '零' : '') : '') + under(r) : '零';
}
/** How many of them, as it would be said. */
const share = (who: string, x: number) => x >= 0.95 ? `尽是${who}` : x < 0.005 ? `${who}寥寥` : x < 0.095 ? `${who}百中有${kan(Math.max(1, Math.round(x*100)))}` : `${who}十中有${kan(Math.round(x*10))}`;
const TITLE = new Map(NIGHTS.map(n => [n.day, n.title]));
const NIGHT_NO = new Map([...NIGHTS.map(n => n.day), ...GHOSTS].sort((a, b) => a - b).map((d, i) => [d, i + 1]));
const dateOf = (day: number) => new Date(Date.UTC(2021, 1, 3) + day*86400000);
const GREET = /晚上好|晚上良|今晚好|晚好|こんばんは|こんばんわ|こんばん|今晩は|晚安|おやすみ|お休み/;

/** The gate she is at: the next one, once she is past the one before. */
function gateIndexAt(u: number){
  let lo = 0, hi = NG;
  while (lo < hi){ const m = (lo + hi) >> 1; if (SLOTS[m].day < u - 0.02) lo = m + 1; else hi = m; }
  return Math.min(NG - 1, lo);
}

/* ---------- the night, on the slip ---------- */
let shownGate = -2;
function showNight(i: number){
  if (i === shownGate) return;
  shownGate = i;
  const day = SLOTS[i].day, t = dateOf(day);
  writeDown(dateY, yearText(t.getUTCFullYear()));
  writeDown(dateD, monthText(t.getUTCMonth() + 1) + dayText(t.getUTCDate()));
  const no = NIGHT_NO.get(day);
  writeDown(nth, no ? `第${kan(no)}夜` : '');
}

/* ---------- what was said, while she flies: one line at a time, sliding along as the next comes ---------- */
const FLYING_MAX = () => innerWidth < 640 ? 3 : 4;
let lastText = '', nextLine = 0, pick = 0, burst = 0, burstGate = -1;
function lineEl(l: Said, count: boolean){
  const e = document.createElement('span');
  e.className = `line s${l.hidden ? 4 : l.soul}`;
  e.setAttribute('role', 'note'); e.setAttribute('aria-label', l.text);
  if (l.ja) e.lang = 'ja';
  const many = count && l.people > 1 ? `${kan(l.people)}人` : '';
  e.innerHTML = `<span class="t">${downHtml(l.text, lineChars(many.length))}</span>` + (many ? `<small lang="zh-CN">${downHtml(many)}</small>` : '');
  return e;
}
/** How many characters a strip takes in one column before it goes on to the next: what fits between the top of the screen and the buttons, less the strip's own margins and the count under the words. */
function lineChars(countLength: number){
  const fs = parseFloat(getComputedStyle(said).fontSize), H = innerHeight, belt = $('belt').offsetHeight, v = $('voices');
  const room = Math.min(H <= 520 ? H - belt - 76 : innerWidth <= 640 ? H*0.52 : Math.min(H*0.68, 640), v.clientHeight - parseFloat(getComputedStyle(v).paddingTop) - 8);
  return Math.max(5, Math.floor((room - 2.2*fs - (countLength ? (0.66*countLength + 0.8)*fs : 0))/(fs*(innerWidth <= 640 ? 1.07 : 1.1))));
}
/** And her title, on its plate: down to the button that brings her back (on its side the plate stands beside the slip, clear of it), less the plate's margins, its seal and the gap under it. */
function callChars(){
  const H = innerHeight, fs = parseFloat(getComputedStyle(call).fontSize), hang = call.parentElement!.getBoundingClientRect();
  const top = hang.height ? hang.top : $('slip').getBoundingClientRect().bottom + 10;
  const room = $('belt').getBoundingClientRect().top - (H <= 520 ? 10 : 94) - top - 3.9*fs;
  return Math.max(6, Math.floor((H <= 520 ? room : Math.min(room, H*0.4))/(fs*1.14)));
}
let shownCall = '';
function writeCall(title: string){ if (title !== shownCall){ shownCall = title; writeDown(callText, title, callChars()); } }
function pushLine(l: Said, keep = FLYING_MAX()){
  const before = said.getBoundingClientRect().width;
  const e = lineEl(l, false); e.classList.add('in');
  said.prepend(e);
  // (the new line takes the right; those before it slide over, not jump)
  const by = said.getBoundingClientRect().width - before;
  said.style.transition = 'none'; said.style.transform = `translateX(${by}px)`;
  void said.offsetWidth;
  said.style.transition = 'transform 1s ease-out'; said.style.transform = '';
  const lines = [...said.children] as HTMLElement[];
  lines.forEach((x, k) => { if (k >= keep) x.classList.add('out'); });
  for (const x of lines.slice(keep)) setTimeout(() => x.remove(), 950);
  lastText = l.text;
  fitLines();
}
/** Whatever the words come to, they never go under the tablet: the oldest goes first. */
function fitLines(){
  const edge = $('left').getBoundingClientRect().right + 8, sliding = new DOMMatrix(getComputedStyle(said).transform).m41;
  let last = said.lastElementChild as HTMLElement | null;
  while (last && said.children.length > 1 && last.getBoundingClientRect().left - sliding < edge){ last.remove(); last = said.lastElementChild as HTMLElement | null; }
}
let pickDay = -1;
function chooseLine(day: number){
  // (each night from its first line: on the storm's nights those are the ones that say the most)
  if (day !== pickDay){ pickDay = day; pick = 0; }
  const all = saidOn(day);
  if (!all.length) return null;
  const real = all.filter(l => !GREET.test(l.text));
  const from = real.length ? real : all;
  for (let n = 0; n < from.length; n++){ const l = from[(pick + n)%from.length]; if (l.text !== lastText){ pick += n + 1; return l; } }
  return from[0];
}
function clearLines(){ said.textContent = ''; said.style.transform = ''; said.style.transition = 'none'; lastText = ''; }

/* ---------- stopped: all of that night ---------- */
let stoppedAt = -1, wanting = 0;
function showStopped(i: number){
  const day = SLOTS[i].day, canLend = (voiceOf(day)?.hidden ?? 0) > 0;
  $('strike').hidden = !canLend;
  // (the lightning goes with the night it was asked for; looking for the 荒魂 she flies into it)
  if (lent && !canLend) lend(false);
  if (canLend && (lent || (wanting === 4 && askedAt !== i))){ askedAt = i; lend(true, day); return; }
  clearLines();
  const all = saidOn(day), first = wanting ? [...all.filter(l => (l.hidden ? 4 : l.soul) === wanting), ...all.filter(l => (l.hidden ? 4 : l.soul) !== wanting)] : all;
  // (as many as there is room for between the tablet and the edge)
  const free = innerWidth - $('left').getBoundingClientRect().right - 24, room = Math.max(2, Math.min(8, Math.floor(free/44)));
  for (const l of first.slice(0, room)) said.appendChild(lineEl(l, true));
  fitLines();
}

/* ---------- 借一道闪电: every other word goes dark and only the room's anger is left, on the post and on the strips, one after another ---------- */
let lent = false, lentLines: Said[] = [], lentNext = 0, askedAt = -1;
function lend(on: boolean, day = SLOTS[reader.on ? reader.i : gateIndexAt(seq.u)].day){
  const was = lent; lent = on;
  if (was !== on) lendFlash(on);
  document.body.classList.toggle('is-lent', on);
  $('strike').setAttribute('aria-pressed', String(on));
  $('strike').querySelector('span')!.textContent = on ? '还回闪电' : '借一道闪电';
  // (given back: the night's own words again, at the next look)
  if (!on){ lentLines = []; if (was){ clearLines(); stoppedAt = -1; } return; }
  clearLines();
  lentLines = hiddenOn(day);
  const free = innerWidth - $('left').getBoundingClientRect().right - 24, room = Math.max(2, Math.min(reader.on && innerWidth < 640 ? 3 : 8, Math.floor(free/44)));
  for (const l of lentLines.slice(0, room)) said.appendChild(lineEl(l, true));
  fitLines();
  lentNext = clock + 4600; lentAt = said.children.length;
}
let lentAt = 0;

/* ---------- how many answered ---------- */
/** A jewel for each of three feelings, bigger the more of it there was that night than most nights. */
const jewelOf = (bit: number, name: string, v: number, usual: number) => { const s = clamp(Math.sqrt(v/Math.max(1e-4, usual)), 0.55, 2.3); return `<i class="soul-${bit}" title="${name}"><svg aria-hidden="true" style="width:${(11*s).toFixed(1)}px;height:${(11*s).toFixed(1)}px"><use href="#magatama"/></svg></i>`; };
let tallyKey = '';
function showTally(i: number, full: boolean){
  const day = SLOTS[i].day, key = `${i}${full}`;
  if (key === tallyKey) return;
  tallyKey = key;
  const v = voiceOf(day);
  const word = (t: string) => `<span aria-label="${t}">${downHtml(t)}</span>`;
  if (!v || v.people <= 0){ tally.innerHTML = word('此夜之言，未曾留下'); return; }
  const about = v.kept ? '' : '约', round = (n: number) => v.kept ? n : Math.round(n/10)*10;
  let h = word(`应者${about}${kan(round(v.people))}`);
  if (full){
    if (v.night > 0) h += word(`道晚安者${about}${kan(round(v.night))}`);
    if (v.kept){
      if (v.gold > 0) h += word(share('故人', v.gold));
      h += word(share('和语', v.kana));
      h += `<span class="jewels">${jewelOf(1, '和魂', v.worry, USUAL.worry)}${jewelOf(2, '幸魂', v.warm, USUAL.warm)}${jewelOf(4, '荒魂', v.neg, USUAL.neg)}</span>`;
    } else h += word('其言未留');
  }
  tally.innerHTML = h;
}

/* ---------- the cord: a jewel for each gate ---------- */
const COLOR: Record<number, string> = { 1: '#7cc4ad', 2: '#ea7650', 4: '#dfe7fa', 8: '#ecc765' };
const jewel = (r: number, x: CanvasRenderingContext2D, px: number, py: number) => { x.beginPath(); x.arc(px, py, r, 0, Math.PI*2); x.fill(); };
const cordX = (i: number, w: number) => 6 + i/(NG - 1)*(w - 12);
const cordY = (px: number, w: number, h: number) => { const t = px/w; return h*0.42 + 7*4*t*(1 - t); };
const MAX_LOG = Math.log(1 + 16000);
function drawCord(){
  const dpr = Math.min(2, devicePixelRatio || 1), w = cordWrap.clientWidth, h = cordWrap.clientHeight;
  if (!w) return;
  cord.width = w*dpr; cord.height = h*dpr;
  const x = cord.getContext('2d')!;
  x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, w, h);
  // the cord itself, twisted hemp, sagging a little between her two hands
  x.strokeStyle = 'rgba(215,178,104,.55)'; x.lineWidth = 1; x.beginPath();
  for (let px = 2; px <= w - 2; px += 3){ const y = cordY(px, w, h); if (px === 2) x.moveTo(px, y); else x.lineTo(px, y); }
  x.stroke();
  // the plain ones first, the coloured over them
  for (const pass of [0, 1]) for (let i = 0; i < NG; i++){
    const day = SLOTS[i].day, v = voiceOf(day), s = soulsOf(day), bit = wanting ? (s & wanting ? wanting : 0) : s & 8 ? 8 : s & 4 ? 4 : s & 1 ? 1 : s & 2 ? 2 : 0;
    if ((bit !== 0) !== (pass === 1)) continue;
    const px = cordX(i, w), py = cordY(px, w, h), r = 0.7 + 3.1*(v && v.people > 0 ? Math.log(1 + v.people)/MAX_LOG : 0.05);
    x.globalAlpha = bit ? 1 : wanting ? 0.3 : v && v.kept ? 0.8 : 0.6;
    x.fillStyle = bit ? COLOR[bit] : v && v.kept ? '#efe7d6' : '#cdbfa4';
    jewel(bit ? r + 0.5 : r, x, px, py);
    // the nights she all but stops for hang a jewel below the cord
    if (beatOf(day) === 2 && (!wanting || bit)){ x.globalAlpha = 0.95; x.fillStyle = bit ? COLOR[bit] : '#d7b268'; x.beginPath(); x.moveTo(px, py + r); x.lineTo(px, py + r + 5); x.lineWidth = 0.8; x.strokeStyle = x.fillStyle; x.stroke(); jewel(1.9, x, px, py + r + 6.5); }
  }
  x.globalAlpha = 1;
}

/* ---------- 寻声 ---------- */
const SOULS = [
  { bit: 1, name: '和魂', note: '灯下叮咛', top: (v: NonNullable<ReturnType<typeof voiceOf>>) => v.worry },
  { bit: 2, name: '幸魂', note: '满座春风', top: (v: NonNullable<ReturnType<typeof voiceOf>>) => v.warm },
  { bit: 4, name: '荒魂', note: '风雨满楼', top: (v: NonNullable<ReturnType<typeof voiceOf>>) => v.neg },
  { bit: 8, name: '奇魂', note: '一夜潮来', top: (v: NonNullable<ReturnType<typeof voiceOf>>) => v.people },
];
let nights: number[] = [], at = 0;
let c: Controls;
const showSeekAt = () => { seekAt.textContent = nights.length ? `${kan(nights.length)}夜之${kan(at + 1)}` : ''; };
function goSoul(k: number){ at = (k + nights.length)%nights.length; showSeekAt(); c.flyTo(nights[at]); }
function chooseSoul(bit: number){
  wanting = wanting === bit ? 0 : bit;
  for (const b of soulsBox.querySelectorAll<HTMLButtonElement>('.soul')) b.setAttribute('aria-pressed', String(Number(b.dataset.soul) === wanting));
  drawCord();
  seekGo.hidden = !wanting;
  if (!wanting){ nights = []; return; }
  const s = SOULS.find(x => x.bit === bit)!;
  nights = SLOTS.filter(g => soulsOf(g.day) & bit).map(g => g.day);
  // the one the room felt it most, to begin with; then along the years
  let best = 0, most = -1;
  nights.forEach((d, k) => { const v = voiceOf(d); const m = v ? s.top(v) : 0; if (m > most){ most = m; best = k; } });
  goSoul(best);
}

/* ---------- the post, up close ---------- */
function readStop(){ stopReading(); document.body.classList.remove('is-reading'); $('read').querySelector('span')!.textContent = '近看门柱'; $('face').hidden = true; }
function nearestStandingGate(u: number){
  // the gate in front of her if it has fully formed, or the one she has just come through
  const i = gateIndexAt(u);
  return iC[i*2] >= 1 ? i : Math.max(0, i - 1);
}
function readStart(){
  const i = nearestStandingGate(seq.u);
  readGate(i); document.body.classList.add('is-reading');
  $('read').querySelector('span')!.textContent = '回到她身边';
  const face = $('face'); face.hidden = false; face.querySelector('span')!.textContent = '绕到柱后';
  // (only the storm's posts have anything that shows only in the lightning)
  const canLend = (voiceOf(SLOTS[i].day)?.hidden ?? 0) > 0;
  $('strike').hidden = !canLend;
  if (lent && !canLend) lend(false);
}

/* ---------- how much of this shows, and when ---------- */
// (its own clock, the frames', so that a clip made frame by frame shows it at the right speed)
let clock = 0, idleAt = 0;
const wake = () => { idleAt = clock; ui.classList.remove('idle'); };

export function initUi(controls: Controls){
  c = controls;
  // the mirror: a bronze mirror's ring of inward arcs
  { const n = 8, R = 17.2, r = R*Math.sin(Math.PI/n)*1.04; let d = ''; for (let i = 0; i <= n; i++){ const a = i/n*Math.PI*2 - Math.PI/2, x = 24 + R*Math.cos(a), y = 24 + R*Math.sin(a); d += i === 0 ? `M${x.toFixed(2)} ${y.toFixed(2)}` : `A${r.toFixed(2)} ${r.toFixed(2)} 0 0 0 ${x.toFixed(2)} ${y.toFixed(2)}`; } $('lobes').setAttribute('d', d); }
  soulsBox.innerHTML = SOULS.map(s => `<button type="button" class="soul soul-${s.bit}" data-soul="${s.bit}" aria-pressed="false"><svg aria-hidden="true"><use href="#magatama"/></svg><b>${s.name}</b><small><span>${s.note}</span></small></button>`).join('');
  for (const b of soulsBox.querySelectorAll<HTMLButtonElement>('.soul')) b.onclick = () => chooseSoul(Number(b.dataset.soul));
  $('seekPrev').onclick = () => goSoul(at - 1);
  $('seekNext').onclick = () => goSoul(at + 1);
  seekBtn.onclick = () => {
    const open = seekPanel.hidden; seekPanel.hidden = !open; seekBtn.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('is-seeking', !seekPanel.hidden);
    if (!open && wanting) chooseSoulOff();
  };
  const chooseSoulOff = () => { wanting = 0; nights = []; seekGo.hidden = true; for (const b of soulsBox.querySelectorAll<HTMLButtonElement>('.soul')) b.setAttribute('aria-pressed', 'false'); drawCord(); };
  $('read').onclick = () => { if (reader.on) readStop(); else readStart(); };
  $('face').onclick = () => { const f = -reader.face as 1 | -1; setReadFace(f); $('face').querySelector('span')!.textContent = f < 0 ? '绕到柱后' : '绕回柱前'; };
  $('strike').onclick = () => lend(!lent);
  timeline.max = String(NG - 1);
  timeline.addEventListener('input', () => { readStop(); c.go(SLOTS[Number(timeline.value)].day); clearLines(); });
  $('speed').onclick = () => { $('speedText').textContent = c.stepSpeed(); };
  $('speedText').textContent = c.speedLabel();
  const motion = $('motion'), sound = $('sound');
  motion.onclick = () => { setMotion(!reduceMotion); motion.setAttribute('aria-pressed', String(reduceMotion)); };
  motion.setAttribute('aria-pressed', String(reduceMotion));
  sound.onclick = () => { setSound(!soundOn()); sound.setAttribute('aria-pressed', String(soundOn())); };
  sound.setAttribute('aria-pressed', String(soundOn()));
  for (const ev of ['pointermove', 'pointerdown', 'keydown'] as const) addEventListener(ev, wake, { passive: true });
  new ResizeObserver(drawCord).observe(cordWrap);
  // (turned on its side: the columns are written again for the room there now is)
  addEventListener('resize', () => { shownCall = '\0'; if (stoppedAt !== -1){ stoppedAt = -1; clearLines(); } });
  new ResizeObserver(() => { document.documentElement.style.setProperty('--left', `${Math.ceil($('left').getBoundingClientRect().right)}px`); fitLines(); }).observe($('left'));
  // (on a phone the belt is as tall as it comes out, and what stands on it stands on that)
  new ResizeObserver(() => { if (innerWidth <= 640) document.documentElement.style.setProperty('--belt', `${$('belt').offsetHeight}px`); else document.documentElement.style.removeProperty('--belt'); }).observe($('belt'));
  drawCord();
}
/** Whenever the way she flies is changed from outside the page's own controls. */
export function leaveReading(){ if (!reader.on) return false; readStop(); return true; }

/** About ten times a second. */
export function updateUi(dt: number){
  clock += dt*1000;
  const u = seq.u, i = gateIndexAt(u), now = clock;
  showNight(i);
  fitLines();
  // the jewel she is at
  const w = cordWrap.clientWidth, h = cordWrap.clientHeight, f = clamp(i, 0, NG - 1);
  if (w){ const px = cordX(f, w); mark.style.transform = `translate(${px.toFixed(1)}px,${(cordY(px, w, h) - h/2 - 7).toFixed(1)}px)`; }
  if (document.activeElement !== timeline) timeline.value = String(f);
  const atEnd = u >= endDay() - 0.01, playing = seq.playing && !atEnd;
  $('playText').textContent = playing ? '停' : '飞';
  $('play').setAttribute('aria-pressed', String(playing));
  reading.hidden = playing;
  const day = SLOTS[i].day;
  if (playing){
    leaveReading();
    if (lent) lend(false);
    askedAt = -1;
    if (stoppedAt !== -1){ stoppedAt = -1; clearLines(); call.hidden = true; nextLine = 0; }
    const big = bigAt(u), moment = big > 0.3 && (beatOf(day) > 0 || SPECIAL_DAYS.has(day));
    if (moment && burstGate !== i){ burstGate = i; burst = beatOf(day) === 2 ? 3 : 2; nextLine = 0; }
    if (now >= nextLine){
      const l = chooseLine(day);
      if (l) pushLine(l);
      else { const old = said.lastElementChild as HTMLElement | null; if (old){ old.classList.add('out'); setTimeout(() => old.remove(), 950); } }
      if (burst > 0){ burst--; nextLine = now + 1000; } else nextLine = now + Math.min(5400, 2600 + 90*Math.max(0, (l?.text.length ?? 0) - 12));
    }
    const title = TITLE.get(day);
    if (moment && title){ writeCall(title); call.hidden = false; } else if (big < 0.1) call.hidden = true;
    showTally(i, false);
    if (now - idleAt > 3600 && seekPanel.hidden) ui.classList.add('idle');
  } else {
    ui.classList.remove('idle');
    showTally(i, true);
    // (more than fit: they come one after another for as long as the light stays)
    if (lent && now >= lentNext && lentLines.length > said.children.length){ pushLine(lentLines[lentAt++%lentLines.length], Math.max(1, said.children.length)); lentNext = now + 3800; }
    if (stoppedAt !== i){ stoppedAt = i; const title = TITLE.get(day); writeCall(title ?? ''); call.hidden = !title; showStopped(i); burstGate = -1; }
  }
}
