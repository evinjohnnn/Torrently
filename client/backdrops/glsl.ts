// GLSL (WebGL 1) for the lenticular backdrop renderer.
//
// The scene and the glass are separate layers:
//   1. A concept's scene shader draws the light behind the glass into an
//      offscreen texture, offset by the pointer so it drifts behind the ribs.
//   2. The glass shader is the only thing that knows about ribs. It refracts
//      whatever texture it is given: each vertical rib is a cylindrical lens,
//      a wider sheet underneath adds depth, R/G/B are sampled apart for
//      dispersion, and highlights roll off into each groove.

export const VERTEX = `
attribute vec2 a;
void main() {
  gl_Position = vec4(a, 0.0, 1.0);
}`;

export const SCENE_PRELUDE = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec3 uPal[5];
uniform vec3 uKey;   // direction towards the key light, normalised
uniform float uKeyI; // light intensity
uniform vec2 uPar;   // pointer parallax, in scene units
float PX;            // size of one pixel in scene units
`;

export const SCENE_MAIN = `
void main() {
  PX = 1.0 / min(uRes.x * 1.6, uRes.y);
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) * PX + uPar;
  vec4 c = scene(p);
  gl_FragColor = vec4(clamp(c.rgb, 0.0, 1.0), 1.0);
}`;

export const GLASS = `
precision highp float;
uniform sampler2D uScene;
uniform vec2 uRes;    // device pixels
uniform float uDpr;   // device pixels per CSS pixel
uniform float uRib;   // rib width, CSS pixels
uniform float uDist;  // distortion
uniform float uBlur;  // frost
uniform float uLight; // highlight strength
uniform float uDisp;  // chromatic dispersion

vec3 sampleScene(vec2 r, vec2 g, vec2 b) {
  vec2 px = uRes / uDpr;
  return vec3(texture2D(uScene, r / px).r,
              texture2D(uScene, g / px).g,
              texture2D(uScene, b / px).b);
}

void main() {
  vec2 px = gl_FragCoord.xy / uDpr;

  // a wider sheet underneath, for depth
  float w2 = uRib * 3.1;
  float ph2 = fract(px.x / w2 + 0.31) - 0.5;
  float lens2 = sqrt(max(0.0, 1.0 - 4.0 * ph2 * ph2));
  float bend2 = -ph2 * w2 * 0.45 * uDist * (0.3 + 0.7 * lens2);

  // the vertical ribs: each pulls the image toward its own centre
  float ph = fract(px.x / uRib) - 0.5;
  float lens = sqrt(max(0.0, 1.0 - 4.0 * ph * ph));
  float bend = -ph * uRib * 1.7 * uDist * (0.35 + 0.65 * lens);
  float dsp = uDisp * 0.09 * uRib * uDist;

  // five frosted taps, red and blue pulled apart
  float bx = 1.0 + uBlur * 2.0;
  float by = 1.0 + uBlur * 7.0;
  vec3 col = vec3(0.0);
  for (int i = -2; i <= 2; i++) {
    float fi = float(i);
    vec2 tap = vec2(fi * bx * 0.5, fi * by);
    vec2 q = vec2(px.x + bend + bend2, px.y) + tap;
    col += sampleScene(q - vec2(dsp, 0.0), q, q + vec2(dsp, 0.0));
  }
  col /= 5.0;

  // highlights: a soft roll-off into each groove rather than a hard line
  float roll = pow(abs(ph) * 2.0, 4.0) * 0.065;
  float hi = exp(-pow((ph + 0.2) / 0.13, 2.0)) * 0.12;
  float spec = exp(-pow((ph + 0.3) / 0.04, 2.0)) * 0.1;
  float sheen = pow(lens, 3.0) * 0.035;
  col *= 1.0 - roll * uLight * vec3(1.0, 1.06, 0.8);
  col += vec3(1.0, 0.99, 1.0) * (hi + spec + sheen) * uLight * (1.0 - 0.35 * dot(col, vec3(0.33)));
  col += spec * uLight * uDisp * vec3(0.05, 0.0, -0.04);
  gl_FragColor = vec4(col, 1.0);
}`;

/** The CSS stand-in for the glass when WebGL is unavailable. */
export const ribCombGradient = (rib: number) =>
  `repeating-linear-gradient(90deg, rgba(255,255,255,0) 0px, rgba(255,255,255,0.35) ${rib * 0.22}px, rgba(255,255,255,0) ${rib * 0.3}px, rgba(0,0,0,0.05) ${rib * 0.9}px, rgba(255,255,255,0) ${rib}px)`;
