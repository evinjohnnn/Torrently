// The six backdrop studies. Each scene is a self-contained GLSL function
// `vec4 scene(vec2 p)` returning colour and depth behind the glass. Scene
// space is centred, with the short axis spanning roughly -0.5..0.5.

export interface BackdropParams {
  /** rib width in CSS pixels */
  ribWidth: number;
  /** lens strength, 0..1.6 */
  distortion: number;
  /** frosting, 0..1 */
  blur: number;
  /** chromatic dispersion, 0..1 */
  dispersion: number;
  /** key light angle in degrees, 0 = right, 90 = top */
  lightAngle: number;
  /** key light intensity, 0..2 */
  light: number;
  /** index into the concept's palettes */
  palette: number;
  /** second, finer glass sheet */
  panel: boolean;
}

export interface Palette {
  name: string;
  tone: "light" | "dark";
  colors: [string, string, string, string];
}

export interface Concept {
  id: string;
  index: string;
  name: string;
  note: string;
  defaults: BackdropParams;
  /** where the second glass sheet sits, as fractions of the width */
  panelSpan: [number, number, number];
  palettes: Palette[];
  scene: string;
}

const liquidChrome = `
// far to near: a thin wisp, a counter ribbon, the hero band
const vec4 CA[3] = vec4[3](vec4(0.10, 1.2, 4.0, -0.15), vec4(0.12, 1.7, 2.4, 0.2), vec4(0.09, 2.3, 0.2, 0.42));
const vec4 CB[3] = vec4[3](vec4(0.02, 5.3, 2.2, 0.32), vec4(0.03, 3.9, 0.4, 0.15), vec4(0.035, 4.6, 1.2, -0.08));
const vec4 CC[3] = vec4[3](vec4(0.022, 4.4, 0.5, 1.0), vec4(0.055, 3.6, 2.6, 1.1), vec4(0.125, 2.9, 1.0, 1.25));
const float CD[3] = float[3](0.85, 0.55, 0.22);

vec4 scene(vec2 p) {
  float t = uTime * 0.04;
  vec3 col = mix(uPal[1], uPal[0], smoothstep(-0.65, 0.55, p.y));
  col *= 1.0 - 0.2 * dot(p * vec2(0.55, 1.0), p * vec2(0.55, 1.0));
  col += uPal[0] * 0.07 * uKeyI * exp(-dot(p - uKey.xy * 0.7, p - uKey.xy * 0.7) * 2.5);
  vec4 acc = vec4(col, 1.0);
  for (int i = 0; i < 3; i++) {
    vec4 a = CA[i], b = CB[i], c = CC[i];
    a.z += t * (1.0 + float(i) * 0.4);
    c.z -= t * 0.8;
    // a broad ground shadow and a tighter contact shadow on what lies behind
    Band g = band(p + vec2(0.0, 0.1 + 0.1 * (1.0 - CD[i])), a, b, c);
    acc.rgb *= 1.0 - 0.12 * (1.0 - smoothstep(0.0, g.w + 0.16, abs(g.d)));
    vec2 so = -uKey.xy * (0.02 + 0.05 * (1.0 - CD[i]));
    Band s = band(p - so, a, b, c);
    acc.rgb *= 1.0 - 0.28 * (1.0 - smoothstep(s.w * 0.3, s.w + 0.05, abs(s.d)));
    Band r = band(p, a, b, c);
    if (r.cov <= 0.0) continue;
    vec3 R = reflect(vec3(0.0, 0.0, -1.0), r.n);
    vec3 m = studioEnv(R, uPal[1] * 0.22, uPal[0] * 0.95) * uPal[2];
    m = filmic(m * 1.4);
    float fres = pow(1.0 - max(r.n.z, 0.0), 3.0);
    m = mix(m, uPal[3], fres * 0.3);
    m *= 0.78 + 0.22 * sqrt(max(1.0 - r.v * r.v, 0.0));
    over(acc, m, r.cov, CD[i]);
  }
  return acc;
}`;

const lavenderMirage = `
vec3 field(vec2 p) {
  vec3 c = mix(uPal[1], uPal[0], smoothstep(-0.9, 0.7, p.x * 0.5 + p.y * 0.9));
  c = mix(c, uPal[3], 0.4 * exp(-dot(p - vec2(0.55, 0.32), p - vec2(0.55, 0.32)) * 3.0));
  c = mix(c, uPal[2], 0.2 * exp(-dot(p - vec2(-0.7, -0.45), p - vec2(-0.7, -0.45)) * 2.5));
  return c;
}
vec3 liquid(vec2 p, vec3 n, vec3 tint, vec3 behind) {
  float thick = n.z;
  vec3 body = behind * mix(vec3(1.0), tint, 0.25 + 0.45 * thick);
  body *= 0.9 + 0.12 * dot(n, uKey);
  body += uPal[0] * pow(1.0 - n.z, 2.4) * 0.5;
  vec3 R = reflect(vec3(0.0, 0.0, -1.0), n);
  body += filmic(studioEnv(R, vec3(0.0), uPal[0] * 0.8)) * pow(1.0 - n.z, 1.5) * 0.18;
  body += spec(n, 70.0) * 0.45 * uKeyI + spec(n, 10.0) * 0.05;
  return body;
}
vec4 scene(vec2 p) {
  vec4 acc = vec4(field(p), 1.0);
  float t = uTime * 0.03;
  vec4 A[2] = vec4[2](vec4(0.15, 1.4, 1.1 + t, 0.22), vec4(0.2, 1.15, 3.6 - t, 0.16));
  vec4 B[2] = vec4[2](vec4(0.04, 3.1, 0.3, 0.27), vec4(0.05, 2.6, 1.2, -0.17));
  vec4 C[2] = vec4[2](vec4(0.065, 1.7, 0.9 + t, 0.95), vec4(0.15, 1.25, 0.2, 1.0));
  float D[2] = float[2](0.8, 0.45);
  vec3 TINT[2] = vec3[2](uPal[2], uPal[1]);
  for (int i = 0; i < 2; i++) {
    Band s = band(p + uKey.xy * 0.05 + vec2(0.0, 0.03), A[i], B[i], C[i]);
    acc.rgb *= mix(vec3(1.0), uPal[2] * 0.85 + 0.15, 0.25 * (1.0 - smoothstep(0.0, s.w + 0.08, abs(s.d))));
    Band r = band(p, A[i], B[i], C[i]);
    if (r.cov <= 0.0) continue;
    vec3 behind = mix(field(p - r.n.xy * 0.12), acc.rgb, 0.3);
    over(acc, liquid(p, r.n, TINT[i], behind), r.cov * 0.94, D[i]);
  }
  // a glass droplet that inverts the room behind it, as a real sphere does
  vec2 c = vec2(0.58, -0.27);
  float rad = 0.085;
  vec2 q = (p - c) / rad;
  acc.rgb *= 1.0 - 0.18 * soft(length((p - c - vec2(-0.02, -0.075)) * vec2(1.0, 3.0)) - 0.07, 0.05);
  float cov = cover((length(q) - 1.0) * rad);
  if (cov > 0.0) {
    vec3 n = normalize(vec3(q, sqrt(max(1.0 - dot(q, q), 0.0))));
    vec3 behind = field(c - (p - c) * 0.6);
    over(acc, liquid(p, n, uPal[3], behind), cov, 0.2);
  }
  return acc;
}`;

const obsidianGlass = `
vec3 room(vec2 p) {
  vec3 c = mix(uPal[0], uPal[1], smoothstep(0.0, 1.15, length(p - vec2(-0.05, 0.2))));
  vec2 l = (p - vec2(0.1, 0.2)) * vec2(0.8, 1.2);
  c += uPal[2] * 0.2 * exp(-dot(l, l) * 2.6);
  float floorY = -0.32;
  c *= 1.0 - 0.3 * smoothstep(floorY + 0.02, floorY - 0.4, p.y);
  c += uPal[2] * 0.025 * exp(-pow((p.y - floorY) * 20.0, 2.0)) * smoothstep(1.2, 0.0, abs(p.x));
  return c;
}
vec3 smoke(vec3 n, vec3 behind) {
  vec3 R = reflect(vec3(0.0, 0.0, -1.0), n);
  float fres = 0.05 + 0.95 * pow(1.0 - n.z, 4.0);
  vec3 env = filmic(studioEnv(R, uPal[0] * 0.3, uPal[2] * 0.9) * 1.3);
  vec3 c = behind * exp(-n.z * 0.5) * 1.6;
  c = mix(c, env, fres);
  c += env * 0.05;
  float back = smoothstep(0.2, 0.95, dot(normalize(n.xy + 1e-4), -normalize(uKey.xy + 1e-4))) * pow(1.0 - n.z, 1.6);
  c += uPal[3] * back * 0.3;
  return c;
}
vec4 scene(vec2 p) {
  vec4 acc = vec4(room(p), 1.0);
  acc.rgb *= 1.0 - 0.6 * soft(length((p - vec2(0.33, -0.41)) * vec2(0.55, 4.0)) - 0.16, 0.12);
  // light focused through the sphere onto the floor
  vec2 cq = (p - vec2(0.33 - uKey.x * 0.22, -0.43)) * vec2(1.6, 7.0);
  acc.rgb += uPal[3] * 0.16 * uKeyI * exp(-dot(cq, cq) * 6.0);
  acc.rgb *= 1.0 - 0.5 * soft(length((p - vec2(-0.37, -0.42)) * vec2(1.4, 5.0)) - 0.14, 0.1);
  // a polished ring, far back
  {
    vec2 q = p - vec2(0.0, 0.1);
    float rr = length(q);
    float d = abs(rr - 0.27) - 0.016;
    float cov = cover(d);
    if (cov > 0.0) {
      float v = clamp((rr - 0.27) / 0.016, -1.0, 1.0);
      vec3 n = normalize(vec3(q / max(rr, 1e-4) * v, sqrt(max(1.0 - v * v, 0.0))));
      vec3 R = reflect(vec3(0.0, 0.0, -1.0), n);
      over(acc, filmic(studioEnv(R, vec3(0.0), uPal[2] * 0.45) * 1.2), cov, 0.85);
    }
  }
  // a tall capsule of smoked glass
  {
    vec2 a = vec2(-0.37, -0.3), b = vec2(-0.37, 0.18);
    vec2 pa = p - a, ba = b - a;
    vec2 q = pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    float r = 0.12;
    float cov = cover(length(q) - r);
    if (cov > 0.0) {
      vec2 qq = q / r;
      vec3 n = normalize(vec3(qq, sqrt(max(1.0 - dot(qq, qq), 0.0))));
      over(acc, smoke(n, room(p - n.xy * 0.1)), cov, 0.6);
    }
  }
  // the large sphere: a lens that shows the room upside down
  {
    vec2 c = vec2(0.33, -0.06);
    float r = 0.34;
    vec2 q = (p - c) / r;
    float d = (length(q) - 1.0) * r;
    acc.rgb *= 1.0 - 0.3 * soft(d - 0.02, 0.05) * (1.0 - cover(d));
    float cov = cover(d);
    if (cov > 0.0) {
      vec3 n = normalize(vec3(q, sqrt(max(1.0 - dot(q, q), 0.0))));
      over(acc, smoke(n, room(c - (p - c) * 1.5)), cov, 0.3);
    }
  }
  return acc;
}`;

const prismaticSilk = `
vec4 scene(vec2 p) {
  vec3 col = mix(uPal[1], uPal[0], smoothstep(-0.65, 0.55, p.y + p.x * 0.15));
  col += uPal[0] * 0.06 * uKeyI * exp(-dot(p - uKey.xy * 0.6, p - uKey.xy * 0.6) * 3.0);
  vec4 acc = vec4(col, 1.0);
  float t = uTime * 0.03;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    vec4 a = vec4(0.12 + 0.02 * fi, 1.5 + 0.1 * fi, 0.5 + 0.55 * fi + t, 0.36);
    vec4 b = vec4(0.04, 3.4 - 0.2 * fi, 1.3 * fi - t, -0.34 + 0.13 * fi);
    vec4 c = vec4(0.055 + 0.014 * mod(fi * 2.0, 3.0), 2.6 + 0.4 * fi, 0.7 * fi + t, 0.5);
    // one layer far back repeats through the flutes; the rest sit close
    float depth = i == 0 ? 0.9 : 0.32 - fi * 0.05;
    Band s = band(p + uKey.xy * 0.03 + vec2(0.0, 0.015), a, b, c);
    acc.rgb *= 1.0 - 0.16 * (1.0 - smoothstep(s.w * 0.4, s.w + 0.04, abs(s.d)));
    Band r = band(p, a, b, c);
    if (r.cov <= 0.0) continue;
    float ndv = max(r.n.z, 0.0);
    vec3 film = 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + ndv * 1.4 + 0.18 * fi));
    vec3 sheen = mix(vec3(1.0), film, 0.4);
    float dif = 0.5 + 0.55 * max(dot(r.n, uKey), 0.0);
    vec3 silk = uPal[2] * dif;
    silk += sheen * (spec(r.n, 14.0) * 0.32 + spec(r.n, 90.0) * 0.5) * uKeyI;
    silk += uPal[3] * pow(1.0 - ndv, 2.0) * 0.4;
    over(acc, silk, r.cov * 0.85, depth);
  }
  return acc;
}`;

const monolithicForms = `
const float FLOOR = -0.26;
float sdBox(vec2 p, vec2 b) { vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
// Silhouettes, shared by drawing and shadow casting.
float dome(vec2 p) { return length(p - vec2(0.62, -0.86)) - 0.7; }
float arch(vec2 p) {
  vec2 q = p - vec2(-0.36, FLOOR - 0.02);
  float ring = abs(length(q) - 0.255) - 0.07;
  return max(ring, -q.y);
}
float blade(vec2 p) { return sdBox(p - vec2(0.06, 0.08), vec2(0.028, 0.36)); }
float orb(vec2 p) { return length(p - vec2(0.1, -0.36)) - 0.085; }
float casters(vec2 p) { return min(min(dome(p), arch(p)), min(blade(p), orb(p))); }
vec3 stone(vec3 n, vec3 tint) {
  vec3 L = uKey;
  float dif = max(dot(n, L), 0.0);
  float wrap = max(dot(n, L) * 0.5 + 0.5, 0.0);
  vec3 c = tint * (0.24 + 0.55 * dif * uKeyI + 0.1 * wrap);
  c += uPal[0] * 0.1 * max(-n.y, 0.0);
  c += spec(n, 20.0) * 0.05 * uKeyI;
  return c;
}

vec4 scene(vec2 p) {
  float wall = smoothstep(FLOOR - 0.03, FLOOR + 0.07, p.y);
  vec3 col = mix(uPal[1], uPal[0], wall);
  col *= 0.88 + 0.18 * smoothstep(1.4, 0.0, length(p - uKey.xy * 0.95));
  col *= 1.0 - 0.18 * exp(-max(casters(p), 0.0) * 14.0) * smoothstep(FLOOR + 0.12, FLOOR - 0.05, p.y);
  vec2 sh = -uKey.xy * 0.2;
  float shadow = soft(casters(p - sh), 0.03 + 0.08 * abs(p.y - FLOOR));
  col *= 1.0 - 0.28 * shadow * uKeyI;
  vec4 acc = vec4(col, 1.0);

  // a thin blade far back
  {
    float cov = cover(blade(p));
    if (cov > 0.0) {
      float u = clamp((p.x - 0.06) / 0.028, -1.0, 1.0);
      over(acc, stone(normalize(vec3(u * 0.35, 0.0, 1.0)), uPal[2]), cov, 0.85);
    }
  }
  // a standing arch: flat face and the curved inner surface
  {
    vec2 q = p - vec2(-0.36, FLOOR - 0.02);
    float cov = cover(arch(p));
    if (cov > 0.0) {
      vec3 c = stone(vec3(0.0, 0.0, 1.0), uPal[2]);
      float r = length(q);
      float lip = smoothstep(0.215, 0.185, r);
      vec3 inner = stone(normalize(vec3(-q / max(r, 1e-4), 0.3)), uPal[2]);
      c = mix(c, inner, lip);
      c *= 1.0 - 0.1 * smoothstep(0.32, 0.18, r) * (1.0 - lip);
      over(acc, c, cov, 0.45);
    }
  }
  // the accent orb, close to the glass
  {
    acc.rgb *= 1.0 - 0.3 * soft(length((p - vec2(0.1, -0.445)) * vec2(1.0, 4.0)) - 0.07, 0.04);
    float cov = cover(orb(p));
    if (cov > 0.0) {
      vec2 q = (p - vec2(0.1, -0.36)) / 0.085;
      vec3 n = normalize(vec3(q, sqrt(max(1.0 - dot(q, q), 0.0))));
      vec3 c = stone(n, uPal[3]) + spec(n, 40.0) * 0.12 * uKeyI;
      over(acc, c, cov, 0.18);
    }
  }
  // a vast dome rising out of frame: the large curved surface
  {
    vec2 q = (p - vec2(0.62, -0.86)) / 0.7;
    float cov = cover(dome(p));
    if (cov > 0.0) {
      vec3 n = normalize(vec3(q, sqrt(max(1.0 - dot(q, q), 0.0))));
      over(acc, stone(n, uPal[2] * 1.04), cov, 0.25);
    }
  }
  return acc;
}`;

const frostedAurora = `
float crest(float x, float i) {
  float t = uTime * 0.03;
  return -0.3 + 0.17 * i
    + (0.08 + 0.02 * i) * sin(x * (1.6 + 0.35 * i) + 0.9 * i + t)
    + 0.035 * sin(x * (4.1 - 0.4 * i) + 2.3 * i - t * 1.3)
    + 0.06 * (fbm(vec2(x * 0.9 + i * 3.1, i)) - 0.5);
}
vec4 scene(vec2 p) {
  vec3 col = mix(uPal[1], uPal[0], smoothstep(-0.6, 0.65, p.y));
  vec4 acc = vec4(col, 1.0);
  vec3 TINT[4] = vec3[4](uPal[3], uPal[2], vec3(0.9, 0.92, 0.97), uPal[2]);
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float y = crest(p.x, fi);
    float below = y - p.y;
    // the highest, most distant wave repeats through the flutes
    float depth = i == 3 ? 0.92 : 0.3 - fi * 0.06;
    // the sheet: luminous at its crest, thinning as it falls away
    float sheet = smoothstep(-PX, PX * 2.0, below) * exp(-max(below, 0.0) / (0.09 + 0.03 * fi));
    float line = exp(-pow(below / (0.006 + 0.002 * fi), 2.0));
    float halo = exp(-max(-below, 0.0) / 0.04) * step(below, 0.0);
    float vary = 0.75 + 0.25 * sin(p.x * 2.3 + fi * 1.7);
    vec3 c = TINT[i];
    float k = (sheet * 0.55 + halo * 0.18) * vary;
    acc.rgb = mix(acc.rgb, c, clamp(k, 0.0, 1.0));
    acc.rgb += c * line * 0.22 * vary;
    acc.a = mix(acc.a, depth, clamp(sheet + line, 0.0, 1.0) * 0.9);
  }
  return acc;
}`;

export const concepts: Concept[] = [
  {
    id: "liquid-chrome",
    index: "01",
    name: "Liquid Chrome",
    note: "Sculptural silver ribbons, twisting through a softbox studio, read through fine vertical reeds.",
    defaults: {
      ribWidth: 14,
      distortion: 0.95,
      blur: 0.12,
      dispersion: 0.2,
      lightAngle: 132,
      light: 1,
      palette: 0,
      panel: false,
    },
    panelSpan: [0.58, 0.86, 0.5],
    palettes: [
      {
        name: "Studio silver",
        tone: "light",
        colors: ["#ececed", "#b4b6ba", "#ffffff", "#c9d2e0"],
      },
      {
        name: "Graphite",
        tone: "dark",
        colors: ["#3a3c41", "#111214", "#d8dbe2", "#5f6b80"],
      },
      {
        name: "Champagne",
        tone: "light",
        colors: ["#f1ebe3", "#c8bba9", "#fff1df", "#e7c9a5"],
      },
      {
        name: "Signal red",
        tone: "light",
        colors: ["#efe3e0", "#9e1b1f", "#ffeceb", "#d71921"],
      },
    ],
    scene: liquidChrome,
  },
  {
    id: "lavender-mirage",
    index: "02",
    name: "Lavender Mirage",
    note: "Translucent liquid forms drifting over ivory and lavender, softened by tightly spaced ridges.",
    defaults: {
      ribWidth: 10,
      distortion: 1.1,
      blur: 0.32,
      dispersion: 0.12,
      lightAngle: 115,
      light: 1,
      palette: 0,
      panel: false,
    },
    panelSpan: [0.1, 0.4, 0.55],
    palettes: [
      {
        name: "Lavender",
        tone: "light",
        colors: ["#f7f3ec", "#cfc4ef", "#a993e0", "#f3d9e3"],
      },
      {
        name: "Sage",
        tone: "light",
        colors: ["#f4f3ec", "#c7d6c6", "#8fae9a", "#e9e2c9"],
      },
      {
        name: "Dusk",
        tone: "dark",
        colors: ["#3d3654", "#1b1828", "#7d6bb3", "#b48aa8"],
      },
      {
        name: "Coral red",
        tone: "light",
        colors: ["#f8eee8", "#eaa49d", "#d71921", "#f7d3c6"],
      },
    ],
    scene: lavenderMirage,
  },
  {
    id: "obsidian-glass",
    index: "03",
    name: "Obsidian Glass",
    note: "Smoked glass volumes in a charcoal room. Highlights are rationed; the ribs do the talking.",
    defaults: {
      ribWidth: 12,
      distortion: 0.85,
      blur: 0.06,
      dispersion: 0.25,
      lightAngle: 140,
      light: 1.1,
      palette: 0,
      panel: false,
    },
    panelSpan: [0.06, 0.3, 0.45],
    palettes: [
      {
        name: "Obsidian",
        tone: "dark",
        colors: ["#1b1b1f", "#050506", "#cfd3dc", "#c46a3d"],
      },
      {
        name: "Ink",
        tone: "dark",
        colors: ["#151a26", "#04060a", "#c3cde0", "#5f86c7"],
      },
      {
        name: "Smoke",
        tone: "dark",
        colors: ["#2a2827", "#0b0a0a", "#e3dcd3", "#a68a6b"],
      },
      {
        name: "Ember",
        tone: "dark",
        colors: ["#241112", "#060404", "#ead7d4", "#e0242b"],
      },
    ],
    scene: obsidianGlass,
  },
  {
    id: "prismatic-silk",
    index: "04",
    name: "Prismatic Silk",
    note: "Layered pearl ribbons with a thin-film sheen that only appears where the light grazes them.",
    defaults: {
      ribWidth: 9,
      distortion: 0.9,
      blur: 0.26,
      dispersion: 0.28,
      lightAngle: 120,
      light: 1,
      palette: 0,
      panel: false,
    },
    panelSpan: [0.62, 0.9, 0.5],
    palettes: [
      {
        name: "Pearl",
        tone: "light",
        colors: ["#f7f3ee", "#e2ddd8", "#fbf8f4", "#d9e2ee"],
      },
      {
        name: "Blush",
        tone: "light",
        colors: ["#f8efec", "#e8d6d2", "#fff7f3", "#efc9c4"],
      },
      {
        name: "Nacre night",
        tone: "dark",
        colors: ["#2b2b33", "#121218", "#c9c6d6", "#7e8fb0"],
      },
      {
        name: "Rosso",
        tone: "light",
        colors: ["#f6e6e4", "#dcaaa6", "#f05a5e", "#ffd9d4"],
      },
    ],
    scene: prismaticSilk,
  },
  {
    id: "monolithic-forms",
    index: "05",
    name: "Monolithic Forms",
    note: "Stone primitives under a hard key light, seen through wide, precision-cut flutes and a second sheet.",
    defaults: {
      ribWidth: 20,
      distortion: 0.65,
      blur: 0.05,
      dispersion: 0.16,
      lightAngle: 145,
      light: 1,
      palette: 0,
      panel: true,
    },
    panelSpan: [0.62, 0.92, 0.45],
    palettes: [
      {
        name: "Travertine",
        tone: "light",
        colors: ["#e3dbd0", "#c7bbac", "#ece5dc", "#b97a5e"],
      },
      {
        name: "Concrete",
        tone: "light",
        colors: ["#d9d9d7", "#b5b5b2", "#e6e6e3", "#3d3d40"],
      },
      {
        name: "Basalt",
        tone: "dark",
        colors: ["#34322f", "#1c1b19", "#5a5651", "#9c5b3f"],
      },
      {
        name: "Red room",
        tone: "light",
        colors: ["#c72f2a", "#8f1f1b", "#ece4dc", "#1d1d1f"],
      },
    ],
    scene: monolithicForms,
  },
  {
    id: "frosted-aurora",
    index: "06",
    name: "Frosted Aurora",
    note: "Layered translucent waves in pale blue, silver and violet behind heavily frosted reeds.",
    defaults: {
      ribWidth: 11,
      distortion: 1.2,
      blur: 0.55,
      dispersion: 0.14,
      lightAngle: 100,
      light: 0.9,
      palette: 0,
      panel: false,
    },
    panelSpan: [0.6, 0.88, 0.5],
    palettes: [
      {
        name: "Polar night",
        tone: "dark",
        colors: ["#121729", "#2a2f4f", "#a9c6ff", "#b9a4ff"],
      },
      {
        name: "Dawn",
        tone: "light",
        colors: ["#eef1f8", "#cfd6ec", "#8fb2f2", "#a993ec"],
      },
      {
        name: "Glacier",
        tone: "light",
        colors: ["#eff5f7", "#c9dde3", "#7fb7c9", "#a7b9e8"],
      },
      {
        name: "Red aurora",
        tone: "dark",
        colors: ["#160a0c", "#3d1216", "#ff8f86", "#e3262d"],
      },
    ],
    scene: frostedAurora,
  },
];

/** The red variant every study offers, last in its palette list. */
export function redPalette(concept: Concept) {
  return concept.palettes.length - 1;
}

export function getConcept(id: string) {
  const concept = concepts.find((item) => item.id === id);
  if (!concept) throw new Error(`Unknown backdrop concept: ${id}`);
  return concept;
}
