/**
 * The WebGL2 compositor — the photometric half of the hybrid render pipeline
 * (Living Weather spec §3). The 2D canvas keeps owning scene assembly (sprites,
 * camera, hit-testing, its own time-of-day washes); this pass sits on a second
 * canvas stacked above it and owns what canvas 2D can't do well: a real colour
 * grade, a bright-pass bloom that makes windows and lanterns halo, golden-hour
 * god rays, vignette and film grain.
 *
 * Contracts (spec §3.2/§3.3):
 * - Tier C safety: any failure — no WebGL2, shader compile, context loss —
 *   leaves the game EXACTLY as it was (the GL canvas hides; 2D is untouched).
 * - Driven, never driving: render() is called from MapView.draw(), so it
 *   inherits the 30fps cap, the hidden-tab pause, and reduce-motion's
 *   single-static-frame behaviour for free. It never schedules its own rAF.
 * - Quality watchdog: if compositing runs slow, bloom + rays switch off
 *   (Tier B); if it's still slow, the compositor retires itself (Tier C).
 *
 * This module is lazy-loaded (dynamic import) so Tier C never downloads it.
 */
import { gradeFor, lerpGrade, NEUTRAL_GRADE, type GradeParams } from '../core/mood-grade';
import type { WeatherMood } from '../core/weather-mood';

export interface CompositeEnv {
  mood: WeatherMood;
  nightAmount: number;
  goldenHour: number;
  cloudFlat: number;
  /** god-ray centre in canvas UV (0..1, y down) — the sky anchor or real sun */
  sunX: number;
  sunY: number;
  /** freeze time-driven texture (grain) — reduce-motion */
  reduced: boolean;
  timeMs: number;
}

const VERT = `#version 300 es
layout(location=0) in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

// Bright-pass: keep only what's meaningfully brighter than its surroundings —
// lit windows, lantern flames, the lighthouse lamp, sun sparkle on water.
const FRAG_BRIGHT = `#version 300 es
precision mediump float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uScene;
uniform float uThreshold;
void main() {
  vec4 c = texture(uScene, vUv);
  float lum = dot(c.rgb, vec3(0.299, 0.587, 0.114));
  float keep = smoothstep(uThreshold, uThreshold + 0.18, lum);
  // warm-biased: embers and lamplight bloom sooner than white sky
  keep *= 0.6 + 0.4 * clamp((c.r - c.b) * 2.0 + 0.5, 0.0, 1.0);
  outColor = vec4(c.rgb * keep, 1.0);
}`;

// 9-tap separable gaussian — run twice (horizontal then vertical).
const FRAG_BLUR = `#version 300 es
precision mediump float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uTex;
uniform vec2 uDir; // (1/w, 0) or (0, 1/h)
void main() {
  float w[5];
  w[0] = 0.227027; w[1] = 0.194594; w[2] = 0.121621; w[3] = 0.054054; w[4] = 0.016216;
  vec3 acc = texture(uTex, vUv).rgb * w[0];
  for (int i = 1; i < 5; i++) {
    vec2 off = uDir * float(i) * 1.6;
    acc += texture(uTex, vUv + off).rgb * w[i];
    acc += texture(uTex, vUv - off).rgb * w[i];
  }
  outColor = vec4(acc, 1.0);
}`;

// Final: grade the scene, add bloom, march god rays toward the sun, finish
// with vignette + grain. Alpha carries the scene's own alpha (premultiplied)
// so uncovered pixels stay transparent and the page shows through untinted.
const FRAG_FINAL = `#version 300 es
precision mediump float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform float uExposure, uSaturation, uTemp, uContrast;
uniform float uBloomAmt, uRays, uVignette, uGrain, uTime;
uniform vec2 uSun;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main() {
  vec4 scene = texture(uScene, vUv);
  vec3 c = scene.rgb;

  // grade: exposure → temperature tilt → saturation → contrast
  c *= uExposure;
  c.r *= 1.0 + uTemp * 0.10;
  c.b *= 1.0 - uTemp * 0.12;
  float lum = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(lum), c, uSaturation);
  c = (c - 0.5 * scene.a) * uContrast + 0.5 * scene.a; // pivot respects premultiplied alpha

  // bloom (additive, already blurred at half res)
  c += texture(uBloom, vUv).rgb * uBloomAmt;

  // god rays: cheap radial march of the bloom/bright texture toward the sun
  if (uRays > 0.001) {
    vec2 toSun = uSun - vUv;
    vec3 rays = vec3(0.0);
    float decay = 1.0;
    for (int i = 0; i < 12; i++) {
      vec2 p = vUv + toSun * (float(i) / 12.0) * 0.35;
      rays += texture(uBloom, p).rgb * decay;
      decay *= 0.86;
    }
    c += rays * (uRays * 0.045) * vec3(1.0, 0.9, 0.72); // warm shafts
  }

  // vignette — gentle, storybook-framed (uv is y-up; bias a touch above centre)
  float d = distance(vUv, vec2(0.5, 0.52));
  c *= 1.0 - uVignette * smoothstep(0.45, 0.95, d);

  // film grain, animated unless reduced (uTime frozen then)
  float g = hash(vUv * vec2(1913.0, 1117.0) + fract(uTime) * 61.0) - 0.5;
  c += g * uGrain * scene.a;

  outColor = vec4(c, scene.a);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

function link(gl: WebGL2RenderingContext, frag: string): WebGLProgram | null {
  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, frag);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    gl.deleteProgram(prog);
    return null;
  }
  return prog;
}

interface Target {
  fbo: WebGLFramebuffer;
  tex: WebGLTexture;
  w: number;
  h: number;
}

export class Compositor {
  private gl: WebGL2RenderingContext;
  private glCanvas: HTMLCanvasElement;
  private progBright: WebGLProgram;
  private progBlur: WebGLProgram;
  private progFinal: WebGLProgram;
  private sceneTex: WebGLTexture;
  private bright: Target | null = null;
  private blurA: Target | null = null;
  private blurB: Target | null = null;
  private grade: GradeParams = { ...NEUTRAL_GRADE };
  private lastMs = 0;
  /** rolling render-cost average (ms) for the quality watchdog */
  private avgCost = 0;
  /** honest (non-warmup, non-check) frames measured since the last tier change */
  private counted = 0;
  /** Tier B: bloom/rays off after sustained slowness; Tier C: retired. */
  private degraded = false;
  private dead = false;
  private frames = 0;
  /** output proven sane by the readback self-check — checks stop after this */
  private proven = false;
  /** why the compositor retired (hearthGl() diagnosis), '' while alive */
  private retiredBecause = '';

  private constructor(
    gl: WebGL2RenderingContext,
    glCanvas: HTMLCanvasElement,
    private source: HTMLCanvasElement,
    programs: { bright: WebGLProgram; blur: WebGLProgram; final: WebGLProgram },
  ) {
    this.gl = gl;
    this.glCanvas = glCanvas;
    this.progBright = programs.bright;
    this.progBlur = programs.blur;
    this.progFinal = programs.final;

    // one fullscreen triangle-strip quad shared by every pass
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    this.sceneTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    // Seed level 0 so the texture is NEVER incomplete — ES3 samples an
    // incomplete texture as opaque black, which would paint the whole map
    // black on any device where a canvas upload silently fails.
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));

    glCanvas.addEventListener('webglcontextlost', () => this.retire('context lost'), { once: true });
  }

  /**
   * Probe + build. Returns null on ANY failure — the caller simply stays on
   * the 2D pipeline (Tier C). The GL canvas is created here, stacked exactly
   * over the source canvas, click-transparent.
   */
  static create(source: HTMLCanvasElement): Compositor | null {
    try {
      const host = source.parentElement;
      if (!host) return null;
      const glCanvas = document.createElement('canvas');
      glCanvas.className = 'map-composite';
      glCanvas.setAttribute('aria-hidden', 'true');
      const gl = glCanvas.getContext('webgl2', {
        alpha: true,
        premultipliedAlpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: 'low-power',
      });
      if (!gl) return null;
      const bright = link(gl, FRAG_BRIGHT);
      const blur = link(gl, FRAG_BLUR);
      const final = link(gl, FRAG_FINAL);
      if (!bright || !blur || !final) return null;
      host.appendChild(glCanvas);
      const c = new Compositor(gl, glCanvas, source, { bright, blur, final });
      c.resize();
      trackCompositor(c);
      return c;
    } catch {
      return null;
    }
  }

  /** Alive and worth calling? MapView checks this each frame. */
  get active(): boolean {
    return !this.dead;
  }

  private makeTarget(w: number, h: number): Target | null {
    const gl = this.gl;
    const tex = gl.createTexture();
    const fbo = gl.createFramebuffer();
    if (!tex || !fbo) return null;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { fbo, tex, w, h };
  }

  /** Match the source canvas backing store; (re)build the half-res chain. */
  resize(): void {
    if (this.dead) return;
    const w = this.source.width || 1;
    const h = this.source.height || 1;
    if (this.glCanvas.width === w && this.glCanvas.height === h && this.bright) return;
    this.glCanvas.width = w;
    this.glCanvas.height = h;
    const hw = Math.max(1, w >> 1);
    const hh = Math.max(1, h >> 1);
    this.bright = this.makeTarget(hw, hh);
    this.blurA = this.makeTarget(hw, hh);
    this.blurB = this.makeTarget(hw, hh);
    if (!this.bright || !this.blurA || !this.blurB) this.retire('framebuffer allocation failed');
  }

  /** Compose one frame. Call after the 2D scene has fully drawn. */
  render(env: CompositeEnv): void {
    if (this.dead) return;
    const started = performance.now();
    const gl = this.gl;
    try {
      // grade eases toward the mood target — ~2.5s feel at 30fps, snapped
      // when reduced so the single static frame is already correct
      const target = gradeFor(env.mood, env);
      const dt = this.lastMs > 0 ? Math.min(0.25, (env.timeMs - this.lastMs) / 1000) : 1;
      this.lastMs = env.timeMs;
      this.grade = env.reduced ? target : lerpGrade(this.grade, target, 1 - Math.exp(-dt / 2.5));
      const g = this.grade;
      const wantFx = !this.degraded && (g.bloom > 0.01 || g.rays > 0.01);

      // scene → texture (premultiplied, matching the context). FLIP_Y because
      // canvas sources are top-left origin while GL UV space is bottom-left —
      // without it the whole island renders upside down.
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.source);

      if (wantFx && this.bright && this.blurA && this.blurB) {
        // bright-pass at half res
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.bright.fbo);
        gl.viewport(0, 0, this.bright.w, this.bright.h);
        gl.useProgram(this.progBright);
        gl.uniform1i(gl.getUniformLocation(this.progBright, 'uScene'), 0);
        gl.uniform1f(gl.getUniformLocation(this.progBright, 'uThreshold'), 0.62);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        // separable blur bright → A → B
        gl.useProgram(this.progBlur);
        gl.uniform1i(gl.getUniformLocation(this.progBlur, 'uTex'), 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.blurA.fbo);
        gl.bindTexture(gl.TEXTURE_2D, this.bright.tex);
        gl.uniform2f(gl.getUniformLocation(this.progBlur, 'uDir'), 1 / this.bright.w, 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.blurB.fbo);
        gl.bindTexture(gl.TEXTURE_2D, this.blurA.tex);
        gl.uniform2f(gl.getUniformLocation(this.progBlur, 'uDir'), 0, 1 / this.blurA.h);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }

      // final to screen
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.glCanvas.width, this.glCanvas.height);
      gl.useProgram(this.progFinal);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
      gl.uniform1i(gl.getUniformLocation(this.progFinal, 'uScene'), 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, wantFx && this.blurB ? this.blurB.tex : this.sceneTex);
      gl.uniform1i(gl.getUniformLocation(this.progFinal, 'uBloom'), 1);
      const u = (n: string) => gl.getUniformLocation(this.progFinal, n);
      gl.uniform1f(u('uExposure'), g.exposure);
      gl.uniform1f(u('uSaturation'), g.saturation);
      gl.uniform1f(u('uTemp'), g.temp);
      gl.uniform1f(u('uContrast'), g.contrast);
      gl.uniform1f(u('uBloomAmt'), wantFx ? g.bloom : 0);
      gl.uniform1f(u('uRays'), wantFx ? g.rays : 0);
      gl.uniform1f(u('uVignette'), g.vignette);
      gl.uniform1f(u('uGrain'), env.reduced ? g.grain * 0.5 : g.grain);
      gl.uniform1f(u('uTime'), env.reduced ? 0 : (env.timeMs % 4000) / 4000);
      // callers pass canvas UV (y down); GL UV is y up after the FLIP_Y upload
      gl.uniform2f(u('uSun'), env.sunX, 1 - env.sunY);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    } catch {
      this.retire('render threw');
      return;
    }

    // Output self-check (the Tier-C contract: NEVER worse than the 2D map).
    // Some mobile drivers compose a black or blank frame while every GL call
    // "succeeds" — so on early frames we read a few pixels back and compare
    // against the 2D source; a bad frame retires the compositor on the spot.
    this.frames += 1;
    const checkFrame = this.frames === 1 || this.frames === 30;
    if (!this.proven && checkFrame) this.selfCheck();

    // Quality watchdog (spec §3.2): JS-side cost incl. the scene upload.
    // Warmup frames (pipeline compile) and self-check frames (readPixels
    // forces a GPU sync) are NOT evidence of a slow device — skip them, and
    // only judge a rolling average once a dozen honest frames are in.
    // Sustained >12ms → drop bloom/rays; still >20ms → retire to Tier C.
    if (this.frames > 3 && !checkFrame) {
      const cost = performance.now() - started;
      this.counted += 1;
      this.avgCost = this.avgCost === 0 ? cost : this.avgCost * 0.9 + cost * 0.1;
      if (this.counted >= 12) {
        if (!this.degraded && this.avgCost > 12) {
          this.degraded = true;
          this.counted = 0; // give Tier B its own dozen frames to prove itself
        } else if (this.degraded && this.avgCost > 20) {
          this.retire('sustained slow frames');
        }
      }
    }
  }

  /** Read sparse output pixels and compare with the 2D source's brightness. */
  private selfCheck(): void {
    const gl = this.gl;
    try {
      const w = this.glCanvas.width;
      const h = this.glCanvas.height;
      const px = new Uint8Array(4);
      let lum = 0;
      let alpha = 0;
      let n = 0;
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          gl.readPixels(
            Math.floor(w * (0.2 + 0.3 * i)),
            Math.floor(h * (0.2 + 0.3 * j)),
            1,
            1,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            px,
          );
          lum += (px[0]! + px[1]! + px[2]!) / 3;
          alpha += px[3]!;
          n++;
        }
      }
      lum /= n;
      alpha /= n;
      // the 2D source's own brightness, downsampled tiny (cheap, twice ever)
      let srcLum = 0;
      const c = document.createElement('canvas');
      c.width = 8;
      c.height = 8;
      const g = c.getContext('2d');
      if (!g) return;
      g.drawImage(this.source, 0, 0, 8, 8);
      const d = g.getImageData(0, 0, 8, 8).data;
      for (let i = 0; i < d.length; i += 4) srcLum += (d[i]! + d[i + 1]! + d[i + 2]!) / 3;
      srcLum /= 64;
      const blackedOut = alpha > 200 && srcLum > 8 && lum < Math.min(3, srcLum * 0.15);
      const vanished = alpha < 10 && srcLum > 8;
      if (blackedOut || vanished) {
        this.retire(blackedOut ? 'self-check: opaque black output' : 'self-check: blank output');
        return;
      }
      if (this.frames >= 30) this.proven = true;
    } catch {
      // a failing CHECK never kills a working picture — only a failing frame does
    }
  }

  /** State for the hearthGl() console helper — remote diagnosis. */
  get info(): { alive: boolean; degraded: boolean; proven: boolean; frames: number; avgCostMs: number; retiredBecause: string } {
    return {
      alive: !this.dead,
      degraded: this.degraded,
      proven: this.proven,
      frames: this.frames,
      avgCostMs: Math.round(this.avgCost * 100) / 100,
      retiredBecause: this.retiredBecause,
    };
  }

  /** Tier C: hide + stop. The 2D pipeline underneath is already complete. */
  private retire(reason: string): void {
    if (this.dead) return;
    this.dead = true;
    this.retiredBecause = reason;
    this.glCanvas.remove();
  }

  dispose(): void {
    this.retire('disposed');
  }
}

/** The most recent compositor (or null) — for the hearthGl() debug helper. */
export let lastCompositor: Compositor | null = null;

export function trackCompositor(c: Compositor | null): void {
  lastCompositor = c;
}
