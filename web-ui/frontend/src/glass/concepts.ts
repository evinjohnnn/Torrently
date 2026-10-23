// The backdrop studies. Each scene is a self-contained GLSL function
// `vec4 scene(vec2 p)` returning colour and depth behind the glass. Scene
// space is centred, with the short axis spanning roughly -0.5..0.5.
//
// Every scene is a single light source photographed out of focus: nothing
// behind the glass has a hard edge, so the flutes draw the image. Palette
// roles are shared: 0 the upper field, 1 the lower field, 2 the light's
// glow, 3 its hottest core.

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
  /** light intensity, 0..2 */
  light: number;
  /** index into the concept's palettes */
  palette: number;
}

export interface Palette {
  name: string;
  tone: "light" | "dark";
  /** four colours, or five for scenes with an extra object colour */
  colors:
    [string, string, string, string] | [string, string, string, string, string];
}

export interface Concept {
  id: string;
  name: string;
  note: string;
  defaults: BackdropParams;
  /** where the light sits in the frame, for the CSS fallback (x%, y%) */
  glow: [number, number];
  palettes: Palette[];
  scene: string;
}

// Olive and oat, after granola: four colours for the light scenes (upper
// field, lower field, glow, core) and five for the object scenes (upper
// field, lower field, then three objects).
const granola: Palette = {
  name: "Granola",
  tone: "light",
  colors: ["#F5F1E6", "#E6DDC4", "#76843E", "#33401C"],
};
const moss: Palette = {
  name: "Moss",
  tone: "dark",
  colors: ["#252A17", "#13160B", "#8C9C4C", "#F3E9C8"],
};
const sage: Palette = {
  name: "Sage",
  tone: "light",
  colors: ["#F3F4EC", "#DDE2CB", "#A9B57E", "#55642A"],
};
const honey: Palette = {
  name: "Honey",
  tone: "light",
  colors: ["#F7F2E4", "#E9DEC1", "#C79F4A", "#5F4B19"],
};
const granolaObjects: Palette = {
  name: "Granola",
  tone: "light",
  colors: ["#F5F1E6", "#E5DBC1", "#6E7C3A", "#FFFDF5", "#B7C18D"],
};
const mossObjects: Palette = {
  name: "Moss",
  tone: "dark",
  colors: ["#2B3020", "#171A0F", "#8E9D4F", "#E9E2CB", "#5D6B35"],
};
const oatObjects: Palette = {
  name: "Oat and honey",
  tone: "light",
  colors: ["#F7F3EA", "#EAE2CE", "#C9A55A", "#FFFDF7", "#98A56B"],
};

const glass = {
  ribWidth: 24,
  distortion: 1.1,
  blur: 0.15,
  dispersion: 0.2,
  lightAngle: 120,
  light: 1.1,
  palette: 0,
};

const signal = `
const vec2 TA = vec2(0.16, -0.32), TB = vec2(0.16, 0.46);
const float FLOOR = -0.34;
float tube(vec2 p) {
  vec2 pa = p - TA, ba = TB - TA;
  return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
}
vec4 scene(vec2 p) {
  vec3 col = mix(uPal[1], uPal[0], smoothstep(-0.7, 0.7, p.y));
  col *= mix(0.93, 1.0, smoothstep(FLOOR - 0.2, FLOOR + 0.12, p.y));
  float d = tube(p);
  float spill = exp(-d / 0.32) * 0.5 + exp(-d / 0.07) * 0.55;
  // its reflection runs long and soft down the floor
  float fall = max(FLOOR - p.y, 0.0);
  float floorMask = smoothstep(FLOOR + 0.04, FLOOR - 0.12, p.y);
  spill += floorMask * exp(-abs(p.x - TA.x) / (0.03 + fall * 0.35)) * exp(-fall / 0.3) * 0.45;
  col = mix(col, uPal[2], clamp(spill * uKeyI, 0.0, 1.0));
  col = mix(col, uPal[3], clamp(exp(-d / 0.011) * 0.95, 0.0, 1.0));
  return vec4(col, 0.88);
}`;

const horizon = `
vec4 scene(vec2 p) {
  float h = -0.08 + 0.03 * sin(p.x * 1.3 + 0.7) + 0.01 * sin(p.x * 3.4 + 2.0);
  float y = p.y - h;
  vec3 col = mix(uPal[1], uPal[0], smoothstep(0.0, 0.55, y));
  if (y < 0.0) col = mix(uPal[0], uPal[1], 0.35) * 0.75;
  // the band, and its blurrier reflection in the ground
  float band = y > 0.0 ? exp(-y / 0.11) : exp(y / 0.16) * 0.7;
  float sun = exp(-abs(y) / 0.012) * exp(-pow((p.x + 0.25) / 0.6, 2.0));
  col = mix(col, uPal[2], clamp(band * uKeyI, 0.0, 1.0));
  col = mix(col, uPal[3], clamp(sun, 0.0, 1.0));
  return vec4(col, 0.88);
}`;

const ember = `
vec4 scene(vec2 p) {
  vec3 col = mix(uPal[1], uPal[0], smoothstep(-0.8, 0.8, p.y - p.x * 0.3));
  vec2 a = vec2(-0.26, -0.08), b = vec2(0.44, 0.25);
  float da = length(p - a), db = length(p - b);
  // out-of-focus discs keep a soft edge and a faint brighter rim
  float big = 1.0 - smoothstep(0.2, 0.36, da);
  float bigGlow = exp(-max(da - 0.26, 0.0) / 0.16);
  float body = big * (0.62 + 0.18 * smoothstep(0.0, 0.3, da));
  col = mix(col, uPal[2], clamp((body + bigGlow * 0.35) * uKeyI, 0.0, 1.0));
  col = mix(col, uPal[3], clamp(exp(-abs(da - 0.27) / 0.03) * 0.12 * big, 0.0, 1.0));
  float small = 1.0 - smoothstep(0.04, 0.11, db);
  float smallGlow = exp(-max(db - 0.07, 0.0) / 0.08);
  col = mix(col, uPal[3], clamp(small * 0.8 + smallGlow * 0.28, 0.0, 1.0));
  return vec4(col, 0.88);
}`;

const bleed = `
vec4 scene(vec2 p) {
  vec3 col = mix(uPal[1], uPal[0], smoothstep(-0.8, 0.6, p.y + 0.2 * p.x));
  vec2 s = (p - vec2(0.95, -0.12)) * vec2(0.8, 1.25);
  float light = exp(-length(s) / 0.36);
  // an unseen window mullion lays one soft diagonal shadow
  float m = abs(dot(p - vec2(0.1, 0.0), normalize(vec2(1.0, 0.32))));
  col = mix(col, uPal[2], clamp(light * 1.7 * uKeyI, 0.0, 1.0));
  // the shadow takes the colour of the light it interrupts
  col = mix(col, col * mix(vec3(1.0), uPal[2] * 0.8 + 0.2, 0.35), 1.0 - smoothstep(0.02, 0.17, m));
  col = mix(col, uPal[3], clamp(exp(-length(s) / 0.12) * 0.8, 0.0, 1.0));
  return vec4(col, 0.85);
}`;

const doorway = `
const float FLOOR = -0.3;
float sdBox(vec2 p, vec2 b) { vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
vec4 scene(vec2 p) {
  vec3 col = mix(uPal[1], uPal[0], smoothstep(-0.6, 0.7, p.y));
  col *= mix(0.92, 1.0, smoothstep(FLOOR - 0.2, FLOOR + 0.12, p.y));
  // an arched opening standing on the floor
  vec2 c = vec2(-0.12, 0.0);
  float d = min(sdBox(p - vec2(c.x, FLOOR + 0.29), vec2(0.11, 0.29)),
                length(p - vec2(c.x, FLOOR + 0.58)) - 0.11);
  float spill = exp(-max(d, 0.0) / 0.09) * 0.45 + exp(-max(d, 0.0) / 0.4) * 0.28;
  // light falling out of the door onto the floor, widening toward us
  float t = max(FLOOR - p.y, 0.0);
  float w = 0.1 + t * 0.85;
  float floorMask = smoothstep(FLOOR + 0.03, FLOOR - 0.12, p.y);
  spill += floorMask * smoothstep(w + 0.12, w - 0.06, abs(p.x - c.x)) * exp(-t / 0.3) * 0.4;
  col = mix(col, uPal[2], clamp(spill * uKeyI, 0.0, 1.0));
  float open = 1.0 - smoothstep(-0.012, 0.012, d);
  vec3 inside = mix(uPal[2], uPal[3], smoothstep(-0.005, -0.07, d));
  col = mix(col, inside, open);
  return vec4(col, 0.88);
}`;

const halo = `
vec4 scene(vec2 p) {
  vec3 col = mix(uPal[1], uPal[0], smoothstep(-0.7, 0.7, p.y));
  vec2 c = vec2(0.2, 0.03);
  float r = length(p - c);
  float d = abs(r - 0.26);
  // brightest along the upper arc, as if fed from above
  float arc = 0.55 + 0.45 * smoothstep(-0.26, 0.26, p.y - c.y);
  float glow = (exp(-d / 0.035) * 0.75 + exp(-d / 0.13) * 0.32) * arc;
  glow += smoothstep(0.26, 0.0, r) * 0.08;
  col = mix(col, uPal[2], clamp(glow * uKeyI, 0.0, 1.0));
  col = mix(col, uPal[3], clamp(exp(-d / 0.005) * arc * 0.9, 0.0, 1.0));
  return vec4(col, 0.88);
}`;

// The Natively notepad hero: a slab, an arc and a disc in lavender, with
// shadows tinted violet rather than grey. Scene units here span -1..1.
const monolith = `
float softEdge(float d, float e) { return 1.0 - smoothstep(0.0, e, d); }
float sdCircle(vec2 p, vec2 c, float r) { return length(p - c) - r; }
float sdBox(vec2 p, vec2 c, vec2 b, float r) {
  vec2 q = abs(p - c) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
float shadow(float d, float r) { return softEdge(d, r) * 0.22; }
vec4 scene(vec2 sp) {
  vec2 p = sp * 2.0;
  float t = uTime;
  // shadows take a tint from the main object instead of going grey
  vec3 SHADE = 1.2 - uPal[2] * 0.6;
  vec3 col = mix(uPal[1], uPal[0], smoothstep(-1.0, 1.0, p.y + 0.1 * p.x));
  vec2 pd = p - vec2(0.03 * sin(t * 0.2), 0.0);
  float disc = sdCircle(pd, vec2(1.38, -0.5), 0.6);
  float slab = sdBox(p, vec2(-0.78, -0.05), vec2(0.15, 0.78), 0.14);
  float arc = abs(sdCircle(p, vec2(-0.2, -0.95), 0.75)) - 0.07;
  col *= 1.0 - SHADE * shadow(sdCircle(pd + vec2(-0.05, 0.1), vec2(1.38, -0.5), 0.6), 0.22);
  col *= 1.0 - SHADE * shadow(sdBox(p + vec2(-0.04, 0.08), vec2(-0.78, -0.05), vec2(0.15, 0.78), 0.14), 0.18);
  col *= 1.0 - SHADE * shadow(abs(sdCircle(p + vec2(-0.03, 0.06), vec2(-0.2, -0.95), 0.75)) - 0.07, 0.14) * 0.8;
  vec3 discCol = uPal[2] * (0.9 + 0.18 * smoothstep(-0.5, 0.65, pd.y));
  discCol += uPal[3] * 0.08 * smoothstep(0.55, 0.6, length(pd - vec2(1.38, -0.5)));
  col = mix(col, discCol, softEdge(disc, 0.006));
  vec3 slabCol = mix(uPal[3], uPal[1], 0.35 * smoothstep(-0.9, 0.9, -p.y)) * (1.0 - 0.1 * smoothstep(-0.93, -0.63, p.x));
  col = mix(col, slabCol, softEdge(slab, 0.006));
  vec3 arcCol = uPal[4] * (0.92 + 0.12 * smoothstep(-1.0, 0.0, p.y));
  col = mix(col, arcCol, softEdge(arc, 0.006));
  return vec4(col, 1.0);
}`;

const objectHelpers = `
mat2 rot2(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
float softEdge(float d, float e) { return 1.0 - smoothstep(0.0, e, d); }
`;

// A cairn of polished river stones, lit from the upper left.
const pebbles = `${objectHelpers}
float stone(vec2 p, vec2 c, vec2 r, float a) {
  vec2 q = rot2(-a) * (p - c);
  q.y *= q.y < 0.0 ? 1.2 : 1.0;
  return (length(q / r) - 1.0) * min(r.x, r.y);
}
vec3 stoneColor(vec2 p, vec2 c, vec2 r, float a, vec3 base) {
  vec2 q = rot2(-a) * (p - c);
  float u = clamp(q.x / r.x, -1.0, 1.0), v = clamp(q.y / r.y, -1.0, 1.0);
  vec3 col = base * (0.76 + 0.32 * smoothstep(-1.0, 0.9, v));
  col += vec3(1.0, 0.98, 0.92) * 0.16 * exp(-pow((u + 0.35) / 0.42, 2.0) - pow((v - 0.45) / 0.3, 2.0));
  col *= 1.0 - 0.1 * smoothstep(0.55, 1.0, abs(u));
  return col * (1.0 - 0.14 * smoothstep(-0.2, -1.0, v));
}
vec3 place(vec3 col, vec2 p, vec2 c, vec2 r, float a, vec3 base, vec3 shade) {
  // a broad cast shadow, and a tight one where the stone meets what is below
  col *= 1.0 - shade * softEdge(stone(p - vec2(0.08, -0.1), c, r, a), 0.24) * 0.22;
  col *= 1.0 - shade * softEdge(stone(p - vec2(0.0, -0.025), c, r * vec2(0.92, 0.9), a), 0.05) * 0.3;
  return mix(col, stoneColor(p, c, r, a, base), softEdge(stone(p, c, r, a), 0.006));
}
vec4 scene(vec2 sp) {
  vec2 p = sp * 2.0;
  vec3 shade = 1.2 - uPal[2] * 0.6;
  vec3 col = mix(uPal[1], uPal[0], smoothstep(-1.0, 1.0, p.y + 0.1 * p.x));
  // cream reads warmer when it borrows a little of the ground colour
  vec3 cream = mix(uPal[3], uPal[1], 0.3);
  col = place(col, p, vec2(-1.05, -0.86), vec2(0.24, 0.12), 0.06, uPal[4], shade);
  col = place(col, p, vec2(0.82, -0.7), vec2(0.7, 0.33), -0.04, uPal[2], shade);
  col = place(col, p, vec2(0.7, -0.13), vec2(0.45, 0.22), 0.08, cream, shade);
  col = place(col, p, vec2(0.8, 0.22), vec2(0.24, 0.14), -0.12, uPal[4], shade);
  return vec4(col, 1.0);
}`;

// Long olive blades crossing in from the right, each with a pale midrib.
const leaves = `${objectHelpers}
float leaf(vec2 p, vec2 c, float len, float w, float a) {
  vec2 q = rot2(-a) * (p - c);
  float r = (len * len * 0.25 + w * w) / (2.0 * w);
  float o = r - w;
  return max(length(q - vec2(0.0, o)), length(q + vec2(0.0, o))) - r;
}
vec3 leafColor(vec2 p, vec2 c, float len, float w, float a, vec3 base) {
  vec2 q = rot2(-a) * (p - c);
  float u = q.x / (len * 0.5), v = clamp(q.y / w, -1.0, 1.0);
  vec3 col = base * (0.84 + 0.22 * smoothstep(-1.0, 1.0, v));
  float rib = exp(-pow(q.y / 0.007, 2.0)) * smoothstep(1.0, 0.55, abs(u));
  col = mix(col, min(base * 1.25 + 0.06, vec3(1.0)), rib * 0.55);
  return col;
}
vec3 place(vec3 col, vec2 p, vec2 c, float len, float w, float a, vec3 base, vec3 shade) {
  col *= 1.0 - shade * softEdge(leaf(p - vec2(0.06, -0.1), c, len, w, a), 0.2) * 0.22;
  return mix(col, leafColor(p, c, len, w, a, base), softEdge(leaf(p, c, len, w, a), 0.006) * 0.96);
}
vec4 scene(vec2 sp) {
  vec2 p = sp * 2.0;
  vec3 shade = 1.2 - uPal[2] * 0.6;
  vec3 col = mix(uPal[1], uPal[0], smoothstep(-1.0, 1.0, p.y + 0.15 * p.x));
  col = place(col, p, vec2(-1.08, 0.72), 0.8, 0.12, -0.45, uPal[4], shade);
  col = place(col, p, vec2(0.48, -0.6), 1.7, 0.27, 0.2, uPal[4], shade);
  col = place(col, p, vec2(1.02, 0.1), 2.3, 0.36, 0.62, uPal[2], shade);
  col = place(col, p, vec2(1.38, -0.62), 0.95, 0.16, 1.1, uPal[2] * 0.8, shade);
  return vec4(col, 1.0);
}`;

export const concepts: Concept[] = [
  {
    id: "pebbles",
    name: "Pebbles",
    note: "A cairn of polished river stones in olive, cream and sage, softly shadowed.",
    defaults: { ...glass },
    glow: [78, 75],
    palettes: [granolaObjects, oatObjects, mossObjects],
    scene: pebbles,
  },
  {
    id: "leaves",
    name: "Leaves",
    note: "Long olive blades crossing in from the right, each with a pale midrib.",
    defaults: { ...glass, ribWidth: 26 },
    glow: [80, 40],
    palettes: [granolaObjects, oatObjects, mossObjects],
    scene: leaves,
  },
  {
    id: "signal",
    name: "Signal",
    note: "A single tube of light, its glow repeated across the flutes and down a dark floor.",
    defaults: { ...glass },
    glow: [61, 45],
    palettes: [moss, granola, sage],
    scene: signal,
  },
  {
    id: "horizon",
    name: "Horizon",
    note: "A low band of light along the horizon, mirrored in the ground below.",
    defaults: { ...glass, ribWidth: 22, blur: 0.3 },
    glow: [40, 58],
    palettes: [granola, moss, sage],
    scene: horizon,
  },
  {
    id: "ember",
    name: "Ember",
    note: "Two lights far out of focus: one large and olive, one small and warm.",
    defaults: { ...glass, ribWidth: 34, distortion: 1 },
    glow: [32, 58],
    palettes: [moss, granola, sage],
    scene: ember,
  },
  {
    id: "bleed",
    name: "Bleed",
    note: "Light spilling across warm paper from outside the frame, crossed by one soft shadow.",
    defaults: { ...glass, ribWidth: 26, blur: 0.28 },
    glow: [100, 62],
    palettes: [honey, granola, moss],
    scene: bleed,
  },
  {
    id: "doorway",
    name: "Doorway",
    note: "An arched opening of warm light in a dark room, spilling out across the floor.",
    defaults: { ...glass, ribWidth: 30 },
    glow: [42, 55],
    palettes: [moss, granola, sage],
    scene: doorway,
  },
  {
    id: "halo",
    name: "Halo",
    note: "A ring of light, brightest along its upper arc, broken into slivers by the glass.",
    defaults: { ...glass, ribWidth: 24 },
    glow: [64, 47],
    palettes: [moss, granola, sage],
    scene: halo,
  },
  {
    id: "monolith",
    name: "Monolith",
    note: "A slab, an arc and a disc with soft tinted shadows; in lavender it is the Natively notepad hero.",
    defaults: { ...glass },
    glow: [90, 75],
    palettes: [
      granolaObjects,
      {
        name: "Lavender",
        tone: "light",
        colors: ["#F4EFFD", "#E2D6F9", "#9C6FF3", "#FFFFFF", "#CDBBFB"],
      },
      mossObjects,
    ],
    scene: monolith,
  },
];

export function getConcept(id: string) {
  const concept = concepts.find((item) => item.id === id);
  if (!concept) throw new Error(`Unknown backdrop concept: ${id}`);
  return concept;
}
