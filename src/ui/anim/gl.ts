/**
 * WebGL2 renderer for the cutout rigs: textured triangle meshes (the body), the weapon quad with a ghost
 * trail, the eyelid patch, and flash / glow / dissolve in the fragment shader. One canvas per battle stage.
 * Pure drawing: positions arrive in texture px with a per-figure mapping to the canvas (see stage.ts).
 */

const VS = `#version 300 es
in vec2 a_pos; in vec2 a_uv; uniform mat3 u_m; out vec2 v_uv;
void main() { vec3 p = u_m * vec3(a_pos, 1.0); v_uv = a_uv; gl_Position = vec4(p.xy, 0.0, 1.0); }`;
const FS = `#version 300 es
precision mediump float;
in vec2 v_uv; out vec4 o;
uniform sampler2D u_tex; uniform float u_alpha, u_flash, u_dissolve, u_glow, u_seed; uniform vec3 u_glowColor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7)) + u_seed) * 43758.5453); }
void main() {
  vec4 c = texture(u_tex, v_uv);           // premultiplied
  if (c.a < 0.003) discard;
  if (u_dissolve > 0.0) {
    float n = hash(floor(v_uv * 96.0)) * 0.85 + hash(floor(v_uv * 13.0)) * 0.15;
    if (n < u_dissolve) discard;
    float edge = smoothstep(u_dissolve, u_dissolve + 0.12, n);
    c.rgb = mix(vec3(1.0, 0.85, 0.5) * c.a, c.rgb, edge);
  }
  c.rgb = mix(c.rgb, vec3(c.a), u_flash);
  // elemental glow: tints the shaded parts, leaves highlights alone (a white robe must not white out)
  float lum = dot(c.rgb, vec3(0.299, 0.587, 0.114)) / max(c.a, 0.001);
  c.rgb += u_glowColor * c.a * u_glow * 0.5 * (1.0 - lum * 0.8);
  o = c * u_alpha;
}`;

export interface Tex { tex: WebGLTexture; w: number; h: number }

export class GL {
  gl: WebGL2RenderingContext;
  private prog: WebGLProgram;
  private loc: Record<string, WebGLUniformLocation | null> = {};
  private aPos: number; private aUv: number;
  private vboPos: WebGLBuffer; private vboUv: WebGLBuffer; private ibo: WebGLBuffer;
  private quadIdx = new Uint16Array([0, 1, 2, 2, 1, 3]);
  dpr = 1;
  canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: "low-power" });
    if (!gl) throw new Error("no webgl2");
    this.gl = gl;
    const sh = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader"); return s; };
    const p = gl.createProgram()!; gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? "link");
    this.prog = p; gl.useProgram(p);
    for (const u of ["u_m", "u_tex", "u_alpha", "u_flash", "u_dissolve", "u_glow", "u_seed", "u_glowColor"]) this.loc[u] = gl.getUniformLocation(p, u);
    this.aPos = gl.getAttribLocation(p, "a_pos"); this.aUv = gl.getAttribLocation(p, "a_uv");
    this.vboPos = gl.createBuffer()!; this.vboUv = gl.createBuffer()!; this.ibo = gl.createBuffer()!;
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.uniform1i(this.loc.u_tex!, 0);
  }

  resize(cssW: number, cssH: number, dpr: number): void {
    this.dpr = dpr;
    const w = Math.max(1, Math.round(cssW * dpr)), h = Math.max(1, Math.round(cssH * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    this.gl.viewport(0, 0, w, h);
  }

  clear(): void { const gl = this.gl; gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); }

  texture(img: HTMLImageElement | HTMLCanvasElement | ImageBitmap): Tex {
    const gl = this.gl; const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.generateMipmap(gl.TEXTURE_2D);
    return { tex, w: (img as any).width, h: (img as any).height };
  }

  /**
   * Draw triangles. `m` maps texture px → clip space (column-major 3×3). Positions and uvs are per vertex.
   */
  draw(tex: Tex, pos: Float32Array, uv: Float32Array, index: Uint16Array, m: Float32Array, fx: { alpha: number; flash: number; dissolve: number; glow: number; glowColor: [number, number, number]; seed: number }): void {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, tex.tex);
    gl.uniformMatrix3fv(this.loc.u_m!, false, m);
    gl.uniform1f(this.loc.u_alpha!, fx.alpha); gl.uniform1f(this.loc.u_flash!, fx.flash); gl.uniform1f(this.loc.u_dissolve!, fx.dissolve);
    gl.uniform1f(this.loc.u_glow!, fx.glow); gl.uniform1f(this.loc.u_seed!, fx.seed); gl.uniform3f(this.loc.u_glowColor!, fx.glowColor[0], fx.glowColor[1], fx.glowColor[2]);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vboPos); gl.bufferData(gl.ARRAY_BUFFER, pos, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(this.aPos); gl.vertexAttribPointer(this.aPos, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vboUv); gl.bufferData(gl.ARRAY_BUFFER, uv, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(this.aUv); gl.vertexAttribPointer(this.aUv, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, index, gl.DYNAMIC_DRAW);
    gl.drawElements(gl.TRIANGLES, index.length, gl.UNSIGNED_SHORT, 0);
  }

  /** A textured quad from four corner positions (texture px) with full uv range. */
  quad(tex: Tex, corners: Float32Array, m: Float32Array, fx: Parameters<GL["draw"]>[5]): void {
    this.draw(tex, corners, QUAD_UV, this.quadIdx, m, fx);
  }

  dispose(): void { const ext = this.gl.getExtension("WEBGL_lose_context"); ext?.loseContext(); }
}

export const QUAD_UV = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);

/** Column-major 3×3: texture px → clip space, given scale + offset in canvas CSS px and the canvas CSS size. */
export function mapping(scale: number, offX: number, offY: number, cssW: number, cssH: number): Float32Array {
  // x_clip = (px*scale + offX) / cssW * 2 - 1 ; y_clip = 1 - (py*scale + offY) / cssH * 2
  const ax = scale * 2 / cssW, bx = offX * 2 / cssW - 1;
  const ay = -scale * 2 / cssH, by = 1 - offY * 2 / cssH;
  return new Float32Array([ax, 0, 0, 0, ay, 0, bx, by, 1]);
}
