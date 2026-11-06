#include <flight/scene>
varying vec3 vW; varying vec3 vLine;
void main(){ gl_FragColor = vec4(applyHaze(vLine, vW), gateAlpha(vW)); }
