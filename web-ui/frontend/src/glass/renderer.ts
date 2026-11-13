import { GLASS, SCENE_MAIN, SCENE_PRELUDE, VERTEX } from "./glsl";
import { getConcept, type BackdropParams, type Concept } from "./concepts";

export interface RenderOptions {
  /** device pixels per CSS pixel; rib width is in CSS pixels */
  dpr?: number;
  /** seconds, drives the slow drift when motion is enabled */
  time?: number;
  /** pointer position over the backdrop, 0..1 on each axis; 0.5 is centred */
  pointer?: [number, number];
  /** how far the scene has risen behind the glass, in CSS pixels */
  scroll?: number;
}

function hexToRgb(hex: string): [number, number, number] {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

interface Program {
  program: WebGLProgram;
  uniforms: Map<string, WebGLUniformLocation | null>;
}

/**
 * Draws a lenticular backdrop in two layers: the concept's scene into an
 * offscreen texture, then the glass, which refracts that texture. Rendering
 * is on demand: call `render` when size, parameters or the pointer change.
 */
export class LenticularRenderer {
  readonly gl: WebGLRenderingContext;
  private programs = new Map<string, Program>();
  private glass: Program;
  private vertex: WebGLShader;
  private quad: WebGLBuffer;
  private target: {
    fbo: WebGLFramebuffer;
    tex: WebGLTexture;
    w: number;
    h: number;
  } | null = null;

  static supported() {
    try {
      return !!document.createElement("canvas").getContext("webgl");
    } catch {
      return false;
    }
  }

  constructor(
    readonly canvas: HTMLCanvasElement,
    preserveDrawingBuffer = false,
  ) {
    const gl = canvas.getContext("webgl", {
      antialias: false,
      alpha: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer,
      powerPreference: "low-power",
    });
    if (!gl) throw new Error("WebGL is not available.");
    this.gl = gl;
    this.vertex = this.compile(gl.VERTEX_SHADER, VERTEX);
    // one triangle that covers the viewport
    this.quad = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    this.glass = this.link(GLASS);
  }

  private compile(type: number, source: string) {
    const gl = this.gl;
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

  private link(fragment: string): Program {
    const gl = this.gl;
    const program = gl.createProgram()!;
    const shader = this.compile(gl.FRAGMENT_SHADER, fragment);
    gl.attachShader(program, this.vertex);
    gl.attachShader(program, shader);
    gl.bindAttribLocation(program, 0, "a");
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
      gl.RGBA,
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
    const [mx, my] = options.pointer ?? [0.5, 0.5];
    const dpr = options.dpr ?? w / Math.max(this.canvas.clientWidth || w, 1);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    // layer 1: the scene behind the glass, shifted by the pointer
    const target = this.ensureTarget(w, h);
    const scene = this.scene(concept);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    gl.viewport(0, 0, w, h);
    gl.useProgram(scene.program);
    gl.uniform2f(this.loc(scene, "uRes"), w, h);
    gl.uniform1f(this.loc(scene, "uTime"), options.time ?? 0);
    // scenes read up to five colours; unused slots repeat the last one
    const colors: string[] = [...palette.colors];
    while (colors.length < 5) colors.push(colors[colors.length - 1]);
    gl.uniform3fv(this.loc(scene, "uPal[0]"), colors.flatMap(hexToRgb));
    gl.uniform3f(
      this.loc(scene, "uKey"),
      key[0] / len,
      key[1] / len,
      key[2] / len,
    );
    gl.uniform1f(this.loc(scene, "uKeyI"), params.light);
    // screen y runs down, scene y runs up; a scene unit is min(w * 1.6, h) device pixels
    const rise = ((options.scroll ?? 0) * dpr) / Math.min(w * 1.6, h);
    gl.uniform2f(this.loc(scene, "uPar"), (mx - 0.5) * 0.14, (0.5 - my) * 0.07 - rise);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // layer 2: the glass, refracting whatever the scene drew
    const glass = this.glass;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.useProgram(glass.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, target.tex);
    gl.uniform1i(this.loc(glass, "uScene"), 0);
    gl.uniform2f(this.loc(glass, "uRes"), w, h);
    gl.uniform1f(this.loc(glass, "uDpr"), dpr);
    gl.uniform1f(this.loc(glass, "uRib"), Math.max(4, params.ribWidth));
    gl.uniform1f(this.loc(glass, "uDist"), params.distortion);
    gl.uniform1f(this.loc(glass, "uBlur"), params.blur);
    gl.uniform1f(this.loc(glass, "uLight"), params.light);
    gl.uniform1f(this.loc(glass, "uDisp"), params.dispersion);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** `release` frees the context itself; only for canvases being discarded. */
  dispose(release = false) {
    const gl = this.gl;
    for (const entry of this.programs.values()) gl.deleteProgram(entry.program);
    gl.deleteProgram(this.glass.program);
    gl.deleteShader(this.vertex);
    gl.deleteBuffer(this.quad);
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
    renderer.render(conceptId, params, { dpr: width / referenceWidth });
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
