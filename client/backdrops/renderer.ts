import { GLASS, SCENE_MAIN, SCENE_PRELUDE, VERTEX } from "./glsl";
import { getConcept, type BackdropParams, type Concept } from "./concepts";

export interface RenderOptions {
  /** multiplies the rib width; use for exports so ribs keep their look */
  ribScale?: number;
  /** seconds, drives the slow drift when motion is enabled */
  time?: number;
}

function hexToRgb(hex: string): [number, number, number] {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Backdrop shader failed to compile: ${log}`);
  }
  return shader;
}

interface Program {
  program: WebGLProgram;
  uniforms: Map<string, WebGLUniformLocation | null>;
}

/**
 * Draws a lenticular backdrop into a canvas. Rendering is on demand: call
 * `render` when the size or parameters change; nothing runs in between.
 */
export class LenticularRenderer {
  readonly gl: WebGL2RenderingContext;
  private programs = new Map<string, Program>();
  private glass: Program;
  private vertex: WebGLShader;
  private vao: WebGLVertexArrayObject;
  private target: {
    fbo: WebGLFramebuffer;
    tex: WebGLTexture;
    w: number;
    h: number;
  } | null = null;

  static supported() {
    try {
      return !!document.createElement("canvas").getContext("webgl2");
    } catch {
      return false;
    }
  }

  constructor(
    readonly canvas: HTMLCanvasElement,
    preserveDrawingBuffer = false,
  ) {
    const gl = canvas.getContext("webgl2", {
      antialias: false,
      alpha: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer,
      powerPreference: "low-power",
    });
    if (!gl) throw new Error("WebGL2 is not available.");
    this.gl = gl;
    this.vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
    this.vao = gl.createVertexArray()!;
    this.glass = this.link(GLASS);
  }

  private link(fragment: string): Program {
    const gl = this.gl;
    const program = gl.createProgram()!;
    const shader = compile(gl, gl.FRAGMENT_SHADER, fragment);
    gl.attachShader(program, this.vertex);
    gl.attachShader(program, shader);
    gl.linkProgram(program);
    gl.deleteShader(shader);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw new Error(
        `Backdrop program failed to link: ${gl.getProgramInfoLog(program)}`,
      );
    return { program, uniforms: new Map() };
  }

  private scene(concept: Concept) {
    let entry = this.programs.get(concept.id);
    if (!entry) {
      entry = this.link(SCENE_PRELUDE + concept.scene + SCENE_MAIN);
      this.programs.set(concept.id, entry);
    }
    return entry;
  }

  private loc(entry: Program, name: string) {
    if (!entry.uniforms.has(name))
      entry.uniforms.set(name, this.gl.getUniformLocation(entry.program, name));
    return entry.uniforms.get(name)!;
  }

  private ensureTarget(w: number, h: number) {
    const gl = this.gl;
    if (this.target && this.target.w === w && this.target.h === h)
      return this.target;
    if (this.target) {
      gl.deleteFramebuffer(this.target.fbo);
      gl.deleteTexture(this.target.tex);
    }
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA8,
      w,
      h,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      tex,
      0,
    );
    this.target = { fbo, tex, w, h };
    return this.target;
  }

  /** Renders at the canvas's current backing-store size. */
  render(
    conceptId: string,
    params: BackdropParams,
    options: RenderOptions = {},
  ) {
    const gl = this.gl;
    if (gl.isContextLost()) return;
    const concept = getConcept(conceptId);
    const palette = concept.palettes[params.palette] ?? concept.palettes[0];
    const w = this.canvas.width,
      h = this.canvas.height;
    if (!w || !h) return;
    const angle = (params.lightAngle * Math.PI) / 180;
    const key = [Math.cos(angle) * 0.62, Math.sin(angle) * 0.62, 0.78];
    const len = Math.hypot(key[0], key[1], key[2]);
    const colors = palette.colors.flatMap(hexToRgb);

    const target = this.ensureTarget(w, h);
    const scene = this.scene(concept);
    gl.bindVertexArray(this.vao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    gl.viewport(0, 0, w, h);
    gl.useProgram(scene.program);
    gl.uniform2f(this.loc(scene, "uRes"), w, h);
    gl.uniform1f(this.loc(scene, "uTime"), options.time ?? 0);
    gl.uniform3fv(this.loc(scene, "uPal"), colors);
    gl.uniform3f(
      this.loc(scene, "uKey"),
      key[0] / len,
      key[1] / len,
      key[2] / len,
    );
    gl.uniform1f(this.loc(scene, "uKeyI"), params.light);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    const glass = this.glass;
    const dpr = w / Math.max(this.canvas.clientWidth || w, 1);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.useProgram(glass.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, target.tex);
    gl.uniform1i(this.loc(glass, "uScene"), 0);
    gl.uniform2f(this.loc(glass, "uRes"), w, h);
    gl.uniform1f(
      this.loc(glass, "uRibW"),
      Math.max(3, params.ribWidth * (options.ribScale ?? dpr)),
    );
    gl.uniform1f(this.loc(glass, "uDistort"), params.distortion);
    gl.uniform1f(this.loc(glass, "uBlur"), params.blur);
    gl.uniform1f(this.loc(glass, "uDisp"), params.dispersion);
    gl.uniform1f(this.loc(glass, "uKeyAng"), angle);
    gl.uniform1f(this.loc(glass, "uKeyI"), params.light);
    gl.uniform1f(this.loc(glass, "uTone"), palette.tone === "dark" ? 1 : 0);
    const [x0, x1, scale] = concept.panelSpan;
    gl.uniform4f(
      this.loc(glass, "uPanel"),
      x0,
      x1,
      scale,
      params.panel ? 1 : 0,
    );
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** `release` frees the context itself; only for canvases being discarded. */
  dispose(release = false) {
    const gl = this.gl;
    for (const entry of this.programs.values()) gl.deleteProgram(entry.program);
    gl.deleteProgram(this.glass.program);
    gl.deleteShader(this.vertex);
    gl.deleteVertexArray(this.vao);
    if (this.target) {
      gl.deleteFramebuffer(this.target.fbo);
      gl.deleteTexture(this.target.tex);
    }
    this.programs.clear();
    this.target = null;
    if (release) gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}

export type ExportType = "image/png" | "image/webp";

/**
 * Renders a backdrop offscreen at an exact pixel size and returns an image.
 * `referenceWidth` is the CSS width the rib width is designed for, so a 4K
 * export keeps the proportions of a 1440px-wide screen.
 */
export async function exportBackdrop(
  conceptId: string,
  params: BackdropParams,
  width: number,
  height: number,
  type: ExportType = "image/png",
  referenceWidth = 1440,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const renderer = new LenticularRenderer(canvas, true);
  const max = renderer.gl.getParameter(renderer.gl.MAX_TEXTURE_SIZE) as number;
  try {
    if (width > max || height > max)
      throw new Error(`This device can export up to ${max}px per side.`);
    renderer.render(conceptId, params, { ribScale: width / referenceWidth });
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Export failed."))),
        type,
        0.94,
      ),
    );
  } finally {
    renderer.dispose(true);
  }
}
