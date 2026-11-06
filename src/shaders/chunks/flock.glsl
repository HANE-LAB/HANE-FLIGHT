// Where a bird of her flock is (src/flock.ts). f: across, behind her, above her (metres), a seed. Its place is a formula: the
// flight line uS - behind metres back, the formation's offset from it, a little wander of its own, and the slow beat that runs
// out along the arms; so a thousand birds cost a few vertices each and nothing on the CPU.
#include <flight/path>
#define TIGHT 0.42
uniform float uS; uniform float uTime; uniform float uSEnd; uniform float uRest; uniform float uAgo; uniform float uPx; uniform vec2 uStroke;
struct Place { vec3 pos; vec3 fwd; vec3 side; vec3 up; float tw; vec3 fwd0; vec3 side0; float s; float x; float sw; float tuck; };
#ifdef ROUND_POSTS
// Round the gate posts, and still no state: a bird has no memory of the posts, where it flies is a formula of where it is along the line. Each post is a cylinder in a stream
// (Milne-Thomson's circle theorem): the streamline that far off is x from the middle of a post of clearance R is at (x + sqrt(x² + 4R²))/2 as it goes by, so it never enters the
// post and no two lines ever cross, and a bird far from it is moved a little too, as a stream parts well before a rock: the flock parts, not only the one bird in the way.
// Along the line it is a lane, not a dodge. The gates come every 60 m or so, under a second apart at her speed, and going out round each post and back in between them was a
// twitch a second (docs/MODELS.md). So a bird moves over well before a gate, over 1.2 to 1.9 s, is there from some 30 m before it to some 20 m after, and drifts back only over
// the next 2 to 3 s: with the next gate already coming, it keeps its lane down the whole row, and a taller gate ahead widens the lane a little, early. Of the gates about it, the
// one that wants the most room has its way. How early, how long it holds and how slowly it comes back are each bird's own, so no two move as one.
// uGates: the gates about her, how far along the line and how tall (src/flock.ts). x: its place across the line.
uniform vec2 uGates[16];
// (which side of a post is fixed for a bird, as its place is; only as they draw together at today can a place cross the line between the sides, and then it is a slide, not a jump)
float postSharp(){ return 1.0/(0.002 + 0.06*uRest + 0.15*smoothstep(0.0, 0.05, uRest)*(1.0 - smoothstep(0.7, 1.0, uRest))); }
// Where the streamline through x is at the posts of a gate whose post centres are ±P, as a push from x
float postPush(float x, float P, float R, float sharp){
  float a = x - P, b = x + P;
  // (inside the posts or outside them: not by each gate's own post, or a bird between two gates of slightly different height would weave across the line from one to the next. The last gate, far wider than the rest, by its own)
  float side = P > 12.0 ? P : 8.5, sa = clamp((x - side)*sharp, -1.0, 1.0), sb = clamp((x + side)*sharp, -1.0, 1.0);
  // (and on whichever side it is taken, never closer than R: it may have started on the other)
  return sa*max(R, 0.5*(a*sa + sqrt(a*a + 4.0*R*R))) - a + sb*max(R, 0.5*(b*sb + sqrt(b*b + 4.0*R*R))) - b;
}
// How much of a gate's room is wanted d metres from it (d < 0: before it), and its first and second derivatives: up over A metres to C1 before it, held to C2 after, down over B.
// The ramps are the quintic smoothstep, whose first and second derivatives are 0 at both ends, so the heading and the bank start and stop without a jolt.
vec3 laneOf(float d, float C1, float A, float C2, float B){
  if (d <= C2 && d >= -C1) return vec3(1.0, 0.0, 0.0);
  float L = d < 0.0 ? A : B, t = clamp(d < 0.0 ? (d + C1 + A)/A : 1.0 - (d - C2)/B, 0.0, 1.0), dir = d < 0.0 ? 1.0 : -1.0;
  return vec3(t*t*t*(t*(6.0*t - 15.0) + 10.0), dir*30.0*t*t*(t - 1.0)*(t - 1.0)/L, 60.0*t*(t - 1.0)*(2.0*t - 1.0)/(L*L));
}
// The bump it used to be, kept for her waiting at today only: there the flock is still, beside the last gate, and the place each bird waits in is the one already chosen
vec3 postsAtRest(float x, float s, float span, float seed, float sharp){
  vec3 o = vec3(0.0);
  float all_ = 0.0, own = 0.8 + 0.4*fract(seed*17.3);
  for (int k = 0; k < 16; k++){
    float d = s - uGates[k].x, h = uGates[k].y, R = 0.045*h + span + 0.7, L0 = (26.0 + 3.6*R)*own, L = L0*(d < 0.0 ? 1.0 : 1.5), z = d/L;
    if (abs(z) >= 1.0) continue;
    float w = 1.0 - z*z, g = w*w*w, g2 = g*g, weight = g2*g2;
    weight *= weight;
    o += weight*postPush(x, 0.305*h, R, sharp)*vec3(g, -6.0*z*w*w/L, 24.0*z*z*w/(L*L) - 6.0*w*w/(1.5*L0*L0));
    all_ += weight;
  }
  return o/(all_ + 1e-36);
}
// One side's soft maximum from its sums (weight, weighted push, weight's derivative, the push's) and the summed second derivatives: the push, its derivative, the one for the bank
vec3 laneSide(vec4 g, float e2){ if (g.x <= 0.0) return vec3(0.0); float e = g.y/g.x; return vec3(e, (g.w - e*g.z)/g.x, e2/g.x); }
// Gives the push across the line, its first derivative along the line (the heading), a second derivative for the bank, and 0 … 1 how tight it passes a post (the wings).
// (the bank: each gate's own second derivative, weighted alike; the true one has a kick in it wherever one gate takes over from another, which would roll the bird for no reason)
vec4 roundPosts(float x, float s, float span, float seed){
  float la = 0.75 + 0.5*fract(seed*17.3), lb = 0.7 + 0.6*fract(seed*29.1), lc = 0.7 + 0.6*fract(seed*41.7);
  float A = 120.0*la, B = 180.0*lb, C1 = 28.0*lc, C2 = 22.0*lc, sharp = postSharp();
  // (kept apart by the way they push: outward, and in toward her. They differ only for a bird between 8.5 m out and the posts of a gate wider than the rest, which it passes
  // inside where it passed all the others outside: the last gate, 52 m after the one before it. There the lane cannot be both; the nearer gate has its way (I, falling off
  // over 8 m), so it changes lane once, halfway between the two, and passes each on its own side)
  vec4 g0 = vec4(0.0), g1 = vec4(0.0);   // weight, weighted push, the weight's derivative, the weighted push's
  vec3 h0 = vec3(0.0), h1 = vec3(0.0);   // the weighted second derivatives, how near (I), its derivative
  float nearD = 1e9, nearP = 0.0, nearH = 1.0;
  for (int k = 0; k < 16; k++){
    float d = s - uGates[k].x;
    if (d <= -(C1 + A) || d >= C2 + B) continue;
    // (at the height they fly: its centre 0.305 of the gate out, as src/toriimodel.ts; its radius, the wing, and what they wander)
    float h = uGates[k].y, P = 0.305*h, D = postPush(x, P, 0.045*h + span + 0.7, sharp);
    vec3 K = laneOf(d, C1, A, C2, B);
    // (a soft maximum: the weight grows as e^(3u), u in metres, so the gate that wants a metre more counts twenty times as much; and it is only in the running as it comes on, K⁴)
    float u = D*K.x, e = exp(min(3.0*abs(u), 60.0)), K3 = K.x*K.x*K.x, w = K3*K.x*e, du = D*K.y, dw = 4.0*K3*K.y*e + w*3.0*sign(u)*du, near = exp(-abs(d)/8.0);
    vec4 a = vec4(w, w*u, dw, dw*u + w*du);
    vec3 b = vec3(w*D*K.z, near, -sign(d)*near/8.0);
    if (D < 0.0){ g1 += a; h1 += b; } else { g0 += a; h0 += b; }
    if (abs(d) < abs(nearD)){ nearD = d; nearP = P; nearH = h; }
  }
  vec4 o = vec4(0.0);
  vec3 r0 = laneSide(g0, h0.x), r1 = laneSide(g1, h1.x);
  if (g0.x > 0.0 && g1.x > 0.0){
    float Z = h0.y + h1.y;
    o.x = (h0.y*r0.x + h1.y*r1.x)/Z;
    o.y = (h0.y*r0.y + h1.y*r1.y + h0.z*r0.x + h1.z*r1.x - o.x*(h0.z + h1.z))/Z;
    o.z = (h0.y*r0.z + h1.y*r1.z)/Z;
  } else o.xyz = g1.x > 0.0 ? r1 : r0;
  // the wings: only where the lane leaves less than half a metre between the wing tip and the post, close by the gate (as a pigeon lifts them between poles)
  float room = abs(abs(x + o.x) - nearP) - 0.045*nearH - span;
  o.w = (1.0 - smoothstep(4.0, 10.0, abs(nearD)))*(1.0 - smoothstep(0.0, 0.5, room));
  // waiting at today: as it was (the ending is the one already chosen); the lane hands over in the last forty metres, where she has all but stopped
  float still = smoothstep(0.85, 1.0, uRest);
  if (still > 0.0) o.xyz = mix(o.xyz, postsAtRest(x, s, span, seed, sharp), still);
  return o;
}
// The list of gates reaches so far back; a bird further behind her than this does not go round anything, so no bird moves as a gate leaves the list (and the lens is in front of those)
float roundFade(float s){ return 1.0 - smoothstep(95.0, 120.0, uS - s); }
#endif
// out: waiting at today, how much further out it goes (she has grown: the ranks stand off her wing tips). ahead: and how far in front of its place (toward the lens, the flock would cover them).
// span: half its wings (m), for the room it needs at a post; only with ROUND_POSTS, for the birds near her (the far ones do not: to the side they are 30 m out; the stream down the middle can go through a post from some 90 m behind her, a few pixels by then)
Place flockPlace(vec4 f, float out_, float ahead, float span){
  Place p;
  p.tw = uTime*(0.55 + 0.35*fract(f.w*7.3)) + f.w*40.0;
  // (waiting at today they draw in close, into one shape: from far off it should read as her wings, not as dust)
  float tight = 1.0 - TIGHT*uRest;
  float s = uS - f.y*tight - 1.3*sin(p.tw*0.9) + ahead*uRest;
  float k = max(0.0, s - uSEnd);   // past the last gate the line lifts away (climb in src/path.ts)
  vec3 c = vec3(pathX(s), pathY(s) + 0.075*k*k/(k + 60.0), s);
  p.fwd = normalize(vec3(pathDX(s), 0.075*k*(k + 120.0)/((k + 60.0)*(k + 60.0)), 1.0));
  p.side = normalize(vec3(p.fwd.z, 0.0, -p.fwd.x)); p.up = vec3(0.0, 1.0, 0.0);
  float ax = abs(f.x);
  // the formation's own slow wing-beat, running out along the arms
  float wave = sin(uTime*1.25 - ax*0.035)*(0.25 + ax*0.05);
  p.fwd0 = p.fwd; p.side0 = p.side; p.s = s;
  p.x = f.x*tight + sign(f.x)*out_*uRest; p.sw = 0.0; p.tuck = 0.0;
  // waiting at today they are the rest of her wings, and they beat with them: the stroke she is on (uStroke, src/bird.ts) runs out along them, later the further from her, as it does along a wing,
  // and carries more the further out, as a wing turning at the shoulder; a shallow V as her wings have, and they go forward a little on the way down
  float xr = abs(p.x), lagged = uStroke.x - 0.3 - xr*0.016;
  wave = mix(wave, 0.32*wave + uStroke.y*xr*0.26*cos(lagged) + xr*0.05, uRest);
  s += uRest*uStroke.y*xr*0.06*sin(lagged);
  c = vec3(pathX(s), pathY(s) + 0.075*k*k/(k + 60.0), s);
#ifdef ROUND_POSTS
  vec4 sw = roundPosts(p.x, s, span, f.w)*roundFade(s);
  p.sw = sw.x;
#endif
  // (she flies at 7.2 m, under the lanterns; so do those close behind her)
  p.pos = c + p.side*(p.x + p.sw + (0.5 + 0.012*ax)*sin(p.tw*1.1)) + p.up*(7.2 + 7.0*uRest + f.z*tight + (0.45 + 0.01*ax)*sin(p.tw*0.8 + 1.0) + wave);
#ifdef ROUND_POSTS
  // it heads the way it is going, and banks into the turn: tan(bank) = v²κ/g, with v well under her real speed, or at 75 m/s every one would stand on a wing tip
  // (waiting at today she is not going anywhere, and neither are they)
  float going = 1.0 - uRest, bank = atan(24.0*going*sw.z), cb = cos(bank), sb = sin(bank);
  p.fwd = normalize(p.fwd0 + p.side0*sw.y); p.side = normalize(p.side0 - p.fwd0*sw.y);
  vec3 up0 = p.up;
  p.up = up0*cb + p.side*sb; p.side = p.side*cb - up0*sb;
  // (a turn costs it height; and should a post come close it lifts its wings out of the way, as a pigeon between poles does)
  p.pos.y -= 1.1*sb*sb;
  p.tuck = going*sw.w;
#endif
  return p;
}
// how far out a 舰长 goes waiting at today: she has grown, half a wingspan some 10 m, and they take up from her wing tips, so the two read as one wing (the stream down the middle stays behind her)
float flockOut(float rank){ return mod(rank, 5.0) > 3.5 ? 0.0 : 7.0; }
// (and closer above and below their line, or from in front the wing is a cloud with no edge to it)
vec4 kanRest(vec4 f){ f.z *= 1.0 - 0.35*uRest; return f; }
// a 总督 waiting at today (k: the k-th of however many): how far out along the wing it goes, and how far above or below its place, so that seen from in front, on the flock, no one of them stands in front of another
float souOut(float k){ return 12.0 + 9.0*floor(k/2.0); }
vec4 souUp(vec4 f, float k){ float row = floor(k/2.0); f.z += uRest*(mod(row, 2.0) > 0.5 ? 3.0 + 2.5*(row + 1.0) : -1.5*row); return f; }
// the tiers Voyage uses, smoothly: a month, half a year, a year (0 … 1 each). a: days with her on the day shown
vec3 tiersOf(float a){ return vec3(smoothstep(30.0, 44.0, a), smoothstep(180.0, 194.0, a), smoothstep(365.0, 379.0, a)); }
// a small bird's model, its wings bent at the shoulder and at the wrist, nose up by pitch, into the world
// (up: 0 … 1 on the way up, when the hand sweeps back and in, so the beat is not a hinge)
vec3 flapped(vec3 q, float arm, float e1, float e2, float up, float pitch, Place P){
  float ax = abs(q.x), a = min(ax, arm), h = max(ax - arm, 0.0), sg = sign(q.x), near = max(0.0, 0.06 - a);
  a = max(0.0, a - 0.06);
  vec3 l = vec3(sg*(0.06 - near + a*cos(e1) + h*cos(e1 + e2)*(1.0 - 0.20*up)), q.y + a*sin(e1) + h*sin(e1 + e2), q.z - 0.34*up*h);
  float c = cos(pitch), s = sin(pitch);
  l = vec3(l.x, l.y*c + l.z*s, -l.y*s + l.z*c);
  return P.side*l.x + P.up*l.y + P.fwd*l.z;
}
