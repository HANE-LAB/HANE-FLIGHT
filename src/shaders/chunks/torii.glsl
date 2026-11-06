// Gate shape and placement, shared by the gate, its outline, its lantern and its feathers (src/gates.ts).
// iA: foot centre (world) and yaw; iB: height, what its plaque says (src/plaque.ts), kind (0 plain wood, 1 vermilion, 2 with feathers), day;
// iC: how far it has come into being (0 not yet, 1 whole, on up to 2 as the cloud has let go of it), its lantern (0…brightness).
// iG: what her passing does to what hangs from it (src/gates.ts): how far its lantern is pushed along the line and across it (radians), how much the paper and the feathers are stirred (0…1).
// aPart: see src/toriimodel.ts. Shape units: the cap's top at about 1.0.
attribute vec4 iA; attribute vec4 iB; attribute vec2 iC; attribute vec3 iG;
bool plainWood(){ return iB.z < 0.5; }
// the gilt, the rope and the paper are in the one vermilion mesh, for the big nights only
bool toriiWears(float part){ return iB.z > 1.5 || plainWood() || !(abs(part - 9.0) < 0.5 || abs(part - 11.0) < 0.5 || abs(part - 12.0) < 0.5); }
vec3 toriiPlace(vec3 p){
  float c = cos(iA.w), s = sin(iA.w);
  vec3 q = p*iB.x;
  return iA.xyz + vec3(c, 0.0, s)*q.x + vec3(0.0, q.y, 0.0) + vec3(-s, 0.0, c)*q.z;   // x across the line, z along it
}
// A lantern on its cord, in gate units, swung about the cord's top under the tie beam: across the line by the wind, at a pendulum's own rate, sqrt(g/L), L the cord in metres; and by her, as she goes under
vec3 lanternSwing(vec3 p, float t, float wind){
  float om = sqrt(9.8/(0.14*iB.x)), across = wind*0.26*(sin(t*om + iB.w*2.7) + 0.35*sin(t*om*2.3 + iB.w)) + iG.y, along = iG.x;
  p.y -= 0.655;
  float c = cos(across), s = sin(across);
  p.xy = vec2(p.x*c - p.y*s, p.x*s + p.y*c);
  c = cos(along); s = sin(along);
  p.yz = vec2(p.y*c + p.z*s, p.z*c - p.y*s);
  p.y += 0.655;
  return p;
}
vec3 toriiTurn(vec3 n){ float c = cos(iA.w), s = sin(iA.w); return vec3(c, 0.0, s)*n.x + vec3(0.0, n.y, 0.0) + vec3(-s, 0.0, c)*n.z; }
