// Shared GLSL for the lenticular backdrop renderer.
//
// Rendering happens in two passes:
//   1. A concept's scene shader draws the sculpture "behind the glass" into an
//      offscreen texture. RGB is colour, alpha is depth behind the glass
//      (0 = touching the glass, 1 = the far studio wall).
//   2. The glass shader looks through vertical fluted ribs: each rib is a
//      cylindrical lens that magnifies, compresses or flips what is behind it
//      depending on that depth, with restrained dispersion, frosting and
//      studio highlights computed from the rib's surface normal.

export const VERTEX = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

export const SCENE_PRELUDE = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec3 uPal[4];
uniform vec3 uKey;   // direction towards the key light, normalised
uniform float uKeyI; // key light intensity
out vec4 outColor;
float PX; // size of one pixel in scene units

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x),
             mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + vec2(17.1, 9.2); a *= 0.5; }
  return s;
}
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
vec3 filmic(vec3 c) { return 1.0 - exp(-c); }
// coverage of a signed distance (negative inside), antialiased over ~1px
float cover(float d) { return clamp(0.5 - d / (PX * 1.2), 0.0, 1.0); }
float soft(float d, float r) { return 1.0 - smoothstep(-r, r, d); }
void over(inout vec4 acc, vec3 col, float a, float depth) {
  acc.rgb = mix(acc.rgb, col, a);
  acc.a = mix(acc.a, depth, a);
}
float spec(vec3 n, float k) {
  return pow(max(dot(reflect(-uKey, n), vec3(0.0, 0.0, 1.0)), 0.0), k);
}

// Procedural photo studio used for reflections: dark floor, pale ceiling,
// a tall softbox on the key side, a weak fill opposite and a top light.
vec3 studioEnv(vec3 r, vec3 lo, vec3 hi) {
  float k = atan(uKey.x, uKey.z);
  float az = atan(r.x, r.z);
  float sky = smoothstep(-0.3, 0.9, r.y);
  vec3 c = mix(lo, hi, sky);
  float box = smoothstep(0.2, 0.05, abs(az - k * 0.85)) * smoothstep(-0.2, 0.2, r.y) * smoothstep(0.95, 0.6, r.y);
  float fill = smoothstep(0.55, 0.25, abs(az + k * 0.6)) * smoothstep(-0.05, 0.45, r.y);
  float top = smoothstep(0.8, 0.97, r.y);
  float horizon = exp(-pow((r.y + 0.03) * 10.0, 2.0));
  return c + hi * (box * 2.4 * uKeyI + fill * 0.35 + top * 0.8 + horizon * 0.2);
}

// A twisted, flowing band. a = (amp, freq, phase, tilt), b = (amp2, freq2,
// phase2, offset), c = (half width, twist freq, twist phase, bulge).
struct Band { float cov; float v; float d; float w; vec3 n; };
float bandY(float x, vec4 a, vec4 b) {
  return a.x * sin(a.y * x + a.z) + b.x * sin(b.y * x + b.z) + a.w * x + b.w;
}
Band band(vec2 p, vec4 a, vec4 b, vec4 c) {
  Band r;
  float dy = a.x * a.y * cos(a.y * p.x + a.z) + b.x * b.y * cos(b.y * p.x + b.z) + a.w;
  float inv = inversesqrt(1.0 + dy * dy);
  float d = (p.y - bandY(p.x, a, b)) * inv;
  float th = c.y * p.x + c.z;
  float ct = cos(th), st = sin(th);
  float w = c.x * max(abs(ct), 0.06);
  r.d = d; r.w = w; r.v = d / w;
  r.cov = cover(abs(d) - w);
  vec3 B = vec3(-dy, 1.0, 0.0) * inv;
  float sg = ct < 0.0 ? -1.0 : 1.0;
  vec3 X = (ct * B + vec3(0.0, 0.0, st)) * sg;
  vec3 N0 = (-st * B + vec3(0.0, 0.0, ct)) * sg;
  float v = clamp(r.v, -1.0, 1.0);
  r.n = normalize(N0 * sqrt(max(1.0 - v * v * 0.85, 0.0)) + X * v * c.w);
  return r;
}
`;

export const SCENE_MAIN = `
void main() {
  PX = 1.0 / min(uRes.x * 1.6, uRes.y);
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) * PX;
  vec4 c = scene(p);
  outColor = vec4(clamp(c.rgb, 0.0, 1.0), clamp(c.a, 0.0, 1.0));
}`;

export const GLASS = `#version 300 es
precision highp float;
uniform sampler2D uScene;
uniform vec2 uRes;
uniform float uRibW;    // rib width in device pixels
uniform float uDistort; // lens strength
uniform float uBlur;    // frosting, 0..1
uniform float uDisp;    // chromatic dispersion, 0..1
uniform float uKeyAng;  // key light angle, radians
uniform float uKeyI;
uniform float uTone;    // 0 for light studios, 1 for dark
uniform vec4 uPanel;    // second glass sheet: x0, x1 (0..1), rib scale, enabled
out vec4 outColor;

float hash11(float n) { return fract(sin(n * 127.1 + 31.7) * 43758.5453); }
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// One flute of reeded glass: s is the cross position (-1..1), c the centre.
// Ribs are cut by hand, so each centre wanders a few percent.
vec2 flute(float x, float W, float origin) {
  float i = floor((x - origin) / W);
  float c = origin + (i + 0.5) * W + (hash11(i + origin) - 0.5) * W * 0.06;
  return vec2(clamp((x - c) / (W * 0.5), -1.0, 1.0), c);
}
float profile(float s) { return sqrt(max(1.0 - s * s * 0.94, 0.0)); }

// Cylindrical lens. Content close to the glass is magnified; content far
// behind it is flipped and shrunk, so it repeats across neighbouring flutes,
// the signature of lenticular glass. Between the two the strength passes
// quickly through 1, the focal point, where a flute shows one smeared column.
float strength(float amount, float depth) {
  return amount * mix(-0.5, 2.6, smoothstep(0.32, 0.72, depth));
}
float lens(float x, vec2 f, float W, float amount, float depth) {
  float a = strength(amount, depth);
  return f.y + (x - f.y) * (1.0 - a) - f.x * (1.0 - profile(f.x)) * W * 0.85 * amount;
}

float depthAt(float x, float y) { return texture(uScene, vec2(x, y) / uRes).a; }
vec3 sampleRGB(float xr, float xg, float xb, float y) {
  return vec3(texture(uScene, vec2(xr, y) / uRes).r,
              texture(uScene, vec2(xg, y) / uRes).g,
              texture(uScene, vec2(xb, y) / uRes).b);
}

struct View { vec3 col; vec2 f; vec2 g; float panel; };

// What the eye sees through the glass at screen column x.
View look(float x, float y) {
  View v;
  float W = uRibW;
  v.f = flute(x, W, 0.0);
  // two fixed-point steps so the lens uses the depth of what it actually sees
  float d = depthAt(x, y);
  float xs = lens(x, v.f, W, uDistort, d);
  d = depthAt(xs, y);
  xs = lens(x, v.f, W, uDistort, d);

  v.panel = 0.0;
  v.g = vec2(0.0);
  if (uPanel.w > 0.5) {
    float x0 = uPanel.x * uRes.x, x1 = uPanel.y * uRes.x;
    v.panel = step(x0, xs) * step(xs, x1);
    if (v.panel > 0.5) {
      float W2 = W * uPanel.z;
      v.g = flute(xs, W2, x0);
      xs = lens(xs, v.g, W2, uDistort * 0.7, d);
    }
  }

  // A vertical cylinder only has power across x, so anything out of focus
  // smears sideways; frosting scatters in both directions.
  float e = v.f.x * v.f.x;
  float a = strength(uDistort, d);
  // minified content is filtered so the repeats stay clean
  float smear = W * uDistort * (0.02 + 0.12 * d * d) + uBlur * W * 0.35 + max(abs(1.0 - a) - 1.0, 0.0) * W * 0.08;
  float frost = uBlur * (3.0 + 14.0 * uBlur) * (0.8 + 0.4 * e);
  float disp = uDisp * (0.2 + 1.8 * e) * W * 0.06 * (0.6 + min(abs(a), 2.0));
  vec3 col = vec3(0.0);
  float wsum = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -2; i <= 2; i++) {
      float w = exp(-float(i * i) * 0.35 - float(j * j) * 0.6);
      float sx = xs + float(i) * smear * 0.5;
      float sy = y + float(j) * frost * 0.6;
      col += w * sampleRGB(sx + disp, sx, sx - disp, sy);
      wsum += w;
    }
  }
  v.col = col / wsum;
  return v;
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = fc / uRes;
  vec3 L = normalize(vec3(cos(uKeyAng), sin(uKeyAng) * 0.5, 0.8));
  // The softbox reflection only lands on part of the sheet, which keeps the
  // highlights from reading as a repeating stripe pattern.
  vec2 lp = vec2(0.5, 0.5) + vec2(cos(uKeyAng), sin(uKeyAng)) * vec2(0.55, 0.42);
  vec2 dl = (uv - lp) * vec2(uRes.x / uRes.y, 1.0);
  float field = exp(-dot(dl, dl) * 1.4) * (0.8 + 0.2 * sin(uv.y * 3.1 + uv.x * 1.7));
  vec3 env = mix(vec3(1.0), vec3(0.55, 0.57, 0.63), uTone);

  // three sub-columns per pixel keep the rib boundaries clean
  vec3 col = vec3(0.0);
  for (int k = -1; k <= 1; k++) {
    View v = look(fc.x + float(k) * 0.33, fc.y);
    vec3 c = v.col;
    float hz = profile(v.f.x);
    vec3 n = normalize(vec3(v.f.x * 0.97, 0.0, hz + 0.04));
    vec3 rl = reflect(-L, n);
    float sharp = pow(max(rl.z, 0.0), 220.0);
    float sheen = pow(max(rl.z, 0.0), 6.0);
    float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
    float fres = pow(1.0 - hz, 3.0);
    c = mix(c, env, fres * mix(0.05, 0.04, uTone) * (0.4 + 0.6 * field));
    // the valley between flutes: a faint seam, strongest where it catches light
    float seam = smoothstep(0.9, 1.0, abs(v.f.x));
    c *= 1.0 - seam * mix(0.015, 0.05, uTone) * (0.5 + 0.5 * field);
    c *= 1.0 + 0.03 * (hz - 0.6) * uKeyI;
    float edge = smoothstep(0.95, 1.0, abs(v.f.x)) * step(0.0, v.f.x * cos(uKeyAng));
    c += edge * field * mix(0.03, 0.05, uTone) * uKeyI;
    float show = mix(1.0 - lum * 0.6, 1.0, uTone);
    c += vec3(1.0, 0.99, 0.97) * (sharp * 0.35 + sheen * 0.008) * field * uKeyI * show;
    if (v.panel > 0.5) {
      float g2 = smoothstep(0.88, 1.0, abs(v.g.x));
      c *= 1.0 - g2 * mix(0.03, 0.1, uTone);
      c = mix(c, env, 0.03);
    }
    col += c;
  }
  col /= 3.0;

  if (uPanel.w > 0.5) {
    // polished bevels on the second sheet's long edges
    for (int k = 0; k < 2; k++) {
      float x = (k == 0 ? uPanel.x : uPanel.y) * uRes.x;
      float t = fc.x - x;
      float side = k == 0 ? 1.0 : -1.0;
      float lit = exp(-pow((t - side * 1.5) / 2.2, 2.0));
      float shade = exp(-pow((t + side * 6.0) / 8.0, 2.0));
      col *= 1.0 - shade * mix(0.05, 0.16, uTone);
      col += lit * vec3(0.95, 0.97, 1.0) * mix(0.16, 0.12, uTone) * (0.5 + 0.5 * field);
      col.r += exp(-pow((t - 1.8) / 1.3, 2.0)) * 0.06 * uDisp;
      col.b += exp(-pow((t + 1.8) / 1.3, 2.0)) * 0.07 * uDisp;
    }
  }

  col += (hash12(fc) - 0.5) / 255.0;
  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;
