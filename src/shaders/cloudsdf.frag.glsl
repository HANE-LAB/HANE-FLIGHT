// How far each coarse cell of the deck is from any cloud, so a ray can leap across empty air (src/clouds.ts). First
// (INIT) a cell is cloud if any voxel in it is; then each pass lets every cell take a neighbour's distance plus the step
// to it, which reaches one cell further each pass. In [0, 1] of uMaxC cells. The deck repeats across x and z.
uniform sampler3D tSrc; uniform float uLayer; uniform float uMaxC;
void main(){
  ivec3 c = ivec3(ivec2(gl_FragCoord.xy), int(uLayer));
#ifdef INIT
  float occ = 0.0;
  for (int z = 0; z < BLOCK; z++) for (int y = 0; y < BLOCK; y++) for (int x = 0; x < BLOCK; x++)
    occ = max(occ, texelFetch(tSrc, c*BLOCK + ivec3(x, y, z), 0).r);
  gl_FragColor = vec4(occ > 0.29 ? 0.0 : 1.0);   // (the deck's field is 0 at its surface, stored as 0.3)
#else
  ivec3 n = textureSize(tSrc, 0);
  float d = texelFetch(tSrc, c, 0).r;
  if (d > 0.0){
    for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++){
      ivec3 o = ivec3(x, y, z), q = c + o;
      if (q.z < 0 || q.z >= n.z) continue;
      q.xy = (q.xy + n.xy)%n.xy;
      d = min(d, texelFetch(tSrc, q, 0).r + length(vec3(o))/uMaxC);
    }
  }
  gl_FragColor = vec4(d);
#endif
}
