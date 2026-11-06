// The flight line (src/path.ts, keep the two the same): s is metres along z
float pathX(float s){ return 60.0*sin(s/430.0 + 0.7) + 24.0*sin(s/181.0 + 2.1); }
float pathY(float s){ return 1.2*sin(s/260.0 + 1.0) + 0.5*sin(s/97.0); }
float pathDX(float s){ return 60.0/430.0*cos(s/430.0 + 0.7) + 24.0/181.0*cos(s/181.0 + 2.1); }
