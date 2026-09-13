// 📖 Docs: obsidian/frontend/components/common.md · obsidian/meta/decisions-log.md ADR-0023
//
// The hero trail as three GPU passes instead of a twelve-primitive SVG filter
// plus a full-viewport CSS mask.
//
// WHAT THIS IS A PORT OF, and why the shapes match the filter it replaces:
//
//   displace → blur along the axis → gate to the subject → grade → mask → over
//
// The SVG version pays for that as ~12 full-region passes, each allocating an
// 8-bit intermediate, with no per-primitive caching — change one attribute and
// Blink re-runs the entire graph. On top of it sat a `mask-image` of twelve
// radial gradients, rebuilt as a CSS string and re-rasterised across the whole
// viewport every frame, where the gradients are 460px wide and only ~120px
// apart: almost pure overdraw.
//
// Here the mask is twelve ellipse evaluations per pixel with no rasterisation at
// all, and the chain is three passes at quarter area.
//
// THE ROTATION. `blur.along` is anisotropic — σ=52px along the smear axis,
// 0 across it — and the axis is a fixed −18°. Rather than blur diagonally,
// passes 1 and 2 work in a space rotated so the axis IS the buffer's X, which
// makes the blur a plain horizontal 1-D kernel. That is exactly the trick the
// SVG used with its rotate / counter-rotate pair; it is just cheaper here.
//
// WHAT IS DELIBERATELY NOT "IMPROVED": the grade clamps between its three
// matrices. In float they would compose into one, and it is tempting. SVG hands
// each primitive's result on through an 8-bit surface, so the chain clamps at
// every step and `saturate 1.3` puts colour out of gamut on purpose — measured
// at up to 18/255 of divergence on the athletes' kit. The clamps are replicated
// so this matches the filter rather than matching the maths.

import type { HeroTrailConfig } from "./hero-trail.config";

/** Ceiling on focuses fed to the shader; mirrors `trail.tailLength`. */
export const GL_MAX_FOCUSES = 16;

/** One gradient of the trail mask, in CSS pixels of the hero box. */
export interface TrailFocus {
  x: number;
  y: number;
  rx: number;
  ry: number;
  alpha: number;
}

export interface TrailFrameState {
  focuses: readonly TrailFocus[];
  /** Displacement in screen px — `strength × speedSensitivity × energy`. */
  displacement: number;
  /** Master fader, 0–1. */
  opacity: number;
}

export interface TrailRenderer {
  /**
   * CSS pixels. Reallocates the offscreen targets. `objectPositionX` follows
   * the video's responsive `object-position`, which changes at the tablet
   * breakpoint — the shader does the cover mapping now, so it has to be told.
   */
  resize(width: number, height: number, objectPositionX?: number): void;
  draw(state: TrailFrameState): void;
  dispose(): void;
  /** True once the context is gone; the caller should stop drawing. */
  isLost(): boolean;
}

const VERT = `#version 300 es
// Fullscreen triangle from gl_VertexID — no buffers, no attributes, no VAO
// juggling. Three vertices cover the viewport with one draw.
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/** Shared helpers: rotation, `object-cover` mapping, the subject gate. */
const COMMON = `
precision highp float;

uniform vec2  uHalfExtent;   // half-size of the rotated working box, screen px
uniform vec2  uCentre;       // hero box centre, screen px
uniform vec2  uAxis;         // (cos, sin) of the smear angle
uniform vec4  uCover;        // object-cover: xy = offset, zw = drawn size

// Rotated space -> screen space.
vec2 toScreen(vec2 u) {
  return vec2(u.x * uAxis.x - u.y * uAxis.y,
              u.x * uAxis.y + u.y * uAxis.x) + uCentre;
}
// Screen space -> rotated space.
vec2 toRotated(vec2 s) {
  vec2 d = s - uCentre;
  return vec2( d.x * uAxis.x + d.y * uAxis.y,
              -d.x * uAxis.y + d.y * uAxis.x);
}
// Replicates \`object-cover\` + \`object-position\`, which the video element used
// to do for us.
vec2 coverUv(vec2 screenPos) {
  return (screenPos - uCover.xy) / uCover.zw;
}

// GL's v runs UP from the bottom; CSS pixels — which is what the focus list,
// \`object-cover\` and the rotation pivot are all expressed in — run DOWN from
// the top. Everything that crosses that boundary goes through here, and the
// intermediate targets stay in GL orientation so the blur pass needs no flip
// at all.
vec2 cssUv(vec2 glUv) { return vec2(glUv.x, 1.0 - glUv.y); }
`;

/**
 * Pass 1 — displace, in the rotated space.
 *
 * `feDisplacementMap` reads the DRAG map at the OUTPUT pixel and fetches the
 * source from an offset position, which is what the two lookups below are.
 */
const FRAG_DISPLACE = `#version 300 es
${COMMON}
uniform sampler2D uVideo;
uniform sampler2D uNoise;
uniform vec2  uRegionOrigin;   // baked-noise region, filter-space units
uniform vec2  uRegionSize;
uniform float uDisplacement;   // screen px
in  vec2 vUv;
out vec4 outColor;

void main() {
  vec2 u = (cssUv(vUv) * 2.0 - 1.0) * uHalfExtent;

  // Filter space is the rotated space at half scale, offset to the hero centre
  // — the same q the baked field was rendered over, so the fibres keep phase.
  vec2 q = (u + uCentre) * 0.5;
  vec2 drag = texture(uNoise, (q - uRegionOrigin) / uRegionSize).rg;

  // R drives displacement along the axis, G across it. The DRAG matrix squeezed
  // R into [0.5,1] so the push is one-signed, and flattened G to a narrow band
  // around 0.5 so the fibres wander without steering.
  vec2 offset = vec2(uDisplacement * (drag.r - 0.5),
                     uDisplacement * (drag.g - 0.5));

  vec2 uv = coverUv(toScreen(u + offset));
  outColor = vec4(texture(uVideo, clamp(uv, 0.0, 1.0)).rgb, 1.0);
}`;

/**
 * Pass 2 — the σ=52px smear, as a plain horizontal 1-D Gaussian.
 *
 * Taps are bilinear PAIRS: each fetch sits between two texels at the weighted
 * midpoint, so one sample carries two texels' worth of the kernel and the tap
 * count halves. Weights are built on the CPU and uploaded, because deriving
 * them per fragment would be the most expensive thing in the shader.
 */
const FRAG_BLUR = `#version 300 es
precision highp float;
uniform sampler2D uSource;
uniform vec2  uTexel;
uniform int   uTaps;
uniform float uOffsets[32];
uniform float uWeights[32];
in  vec2 vUv;
out vec4 outColor;

void main() {
  vec4 sum = texture(uSource, vUv) * uWeights[0];
  for (int i = 1; i < 32; i++) {
    if (i >= uTaps) break;
    vec2 d = vec2(uOffsets[i] * uTexel.x, 0.0);
    sum += texture(uSource, vUv + d) * uWeights[i];
    sum += texture(uSource, vUv - d) * uWeights[i];
  }
  outColor = sum;
}`;

/**
 * Pass 3 — gate, grade, mask, and draw the finished picture.
 *
 * THIS PASS IS OPAQUE, and that is not an optimisation — it is a correctness
 * fix. The obvious design is a transparent canvas holding only the treatment,
 * blended over the `<video>` element beneath it, which is exactly what the SVG
 * filter did. It cannot work here: Chrome's WEBGL TEXTURE UPLOAD AND ITS VIDEO
 * COMPOSITOR DO NOT AGREE ON COLOUR. Measured on one frame of this clip, the
 * texture path comes back ~6/255 darker than the element (mean luma 74.9 vs
 * 81.0; R and B are worst, G nearly exact — a BT.601/BT.709-shaped mismatch,
 * and NOT something the file's colour tags fix, which are already explicit
 * BT.709).
 *
 * Blend a texture-derived colour over an element-derived one and that constant
 * offset appears wherever the mask is non-zero — a dark disc trailing the
 * cursor, strongest over the sky where the subject gate still passes ~0.5. The
 * SVG never showed it because both of its layers were composited video.
 *
 * So the canvas draws the base as well, from the same texture as the effect.
 * The offset still exists, but it now applies to the whole hero uniformly,
 * where there is nothing to compare it against and no edge for the eye to find.
 */
const FRAG_COMPOSITE = `#version 300 es
${COMMON}
uniform sampler2D uVideo;
uniform sampler2D uSmear;
uniform vec2  uResolution;
uniform float uOpacity;
uniform int   uFocusCount;
uniform vec4  uFocus[${GL_MAX_FOCUSES}];   // xy = centre, zw = radii (screen px)
uniform float uFocusAlpha[${GL_MAX_FOCUSES}];
uniform float uSubjectK;
uniform float uSaturation;
uniform float uHueShift;
uniform float uCold;
in  vec2 vUv;
out vec4 outColor;

// Radial falloff for one focus: (1 − r²)².
//
// It must reach zero with ZERO SLOPE, which is the whole point. The six-stop
// table this replaces was interpolated linearly, so alpha ran into the rim at a
// slope of −0.70 and then flatly stopped — a first-derivative break, and the eye
// finds those as a hard edge (Mach banding) even though the value itself is
// continuous. It read as a solid ring at the edge of the trail. Five weaker
// bands sat at the interior stops for the same reason.
//
// (1 − r²)² arrives at zero tangentially (slope −0.19 → 0) and is smooth
// throughout, and it tracks the authored stop values to within 0.034 — so the
// designed shape is kept, only its kinks are gone.
float falloff(float r) {
  float k = 1.0 - r * r;
  return k <= 0.0 ? 0.0 : k * k;
}

vec3 saturateM(vec3 c, float s) {
  return clamp(mat3(
    0.213 + 0.787 * s, 0.213 - 0.213 * s, 0.213 - 0.213 * s,
    0.715 - 0.715 * s, 0.715 + 0.285 * s, 0.715 - 0.715 * s,
    0.072 - 0.072 * s, 0.072 - 0.072 * s, 0.072 + 0.928 * s) * c, 0.0, 1.0);
}
vec3 hueRotateM(vec3 c, float deg) {
  float a = radians(deg), cs = cos(a), sn = sin(a);
  return clamp(mat3(
    0.213 + cs * 0.787 - sn * 0.213, 0.213 - cs * 0.213 + sn * 0.143, 0.213 - cs * 0.213 - sn * 0.787,
    0.715 - cs * 0.715 - sn * 0.715, 0.715 + cs * 0.285 + sn * 0.140, 0.715 - cs * 0.715 + sn * 0.715,
    0.072 - cs * 0.072 + sn * 0.928, 0.072 - cs * 0.072 - sn * 0.283, 0.072 + cs * 0.928 + sn * 0.072) * c,
    0.0, 1.0);
}
vec3 coldM(vec3 c, float k) {
  return clamp(mat3(1.0, 0.0, 0.0,
                    0.0, 1.0, 0.0,
                    -0.18 * k, -0.12 * k, 1.0 - 0.4 * k) * c, 0.0, 1.0);
}

void main() {
  vec2 screenPos = cssUv(vUv) * uResolution;
  vec3 base = texture(uVideo, clamp(coverUv(screenPos), 0.0, 1.0)).rgb;

  // Locality. Twelve ellipses evaluated per pixel, summed and clamped — which
  // is what \`mask-composite: add\` did, minus rasterising twelve viewport-sized
  // gradient layers to find out.
  float mask = 0.0;
  for (int i = 0; i < ${GL_MAX_FOCUSES}; i++) {
    if (i >= uFocusCount) break;
    vec2 d = (screenPos - uFocus[i].xy) / uFocus[i].zw;
    mask += uFocusAlpha[i] * falloff(length(d));
  }
  // Ease into the ceiling instead of clamping. Twelve overlapping focuses sum
  // well past 1 near the head of the trail, and a hard clamp puts a slope break
  // along the iso-contour where the sum crosses it — a second ring, from the
  // same cause as the rim above. The knee is high so everything below 0.85 is
  // untouched and the core still reaches ~1.
  const float knee = 0.85;
  mask = mask < knee
    ? mask
    : 1.0 - (1.0 - knee) * exp(-(mask - knee) / (1.0 - knee));
  mask *= uOpacity;
  if (mask <= 0.0) { outColor = vec4(base, 1.0); return; }

  // Pass 1 stored CSS-oriented content into a GL-oriented target, so the
  // lookup flips back the same way it went in.
  vec2 smearUv = (toRotated(screenPos) / uHalfExtent) * 0.5 + 0.5;
  vec3 smear = texture(uSmear, cssUv(smearUv)).rgb;

  // The subject gate reads the UNDISPLACED picture, as \`feColorMatrix\` on
  // SourceGraphic did: "how much is this pixel a runner rather than sky". Warm
  // dark pixels score high, blue-dominant bright ones ~0 — without it the smear
  // treats sky and figures alike and the sky turns to grey mush.
  float subject = clamp(1.2 * uSubjectK * base.r
                      + 0.2 * uSubjectK * base.g
                      - 1.2 * uSubjectK * base.b
                      + (1.0 - 0.65 * uSubjectK), 0.0, 1.0);

  vec3 graded = coldM(hueRotateM(saturateM(smear, uSaturation), uHueShift), uCold);

  // \`feMerge(SourceGraphic, GRADED_CLIPPED)\` under the mask, written out: the
  // treatment laid over the footage at the gated alpha. Both terms now come
  // from the same texture, so a mask of zero returns \`base\` EXACTLY and the
  // effect has no edge.
  outColor = vec4(mix(base, graded, subject * mask), 1.0);
}`;

const compile = (
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader | null => {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
};

const link = (
  gl: WebGL2RenderingContext,
  fragSource: string,
): WebGLProgram | null => {
  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragSource);
  if (!vs || !fs) return null;
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }
  return program;
};

/** Gaussian taps collapsed into bilinear pairs. Built once, per σ. */
const buildBlurKernel = (sigma: number, maxTaps: number) => {
  const radius = Math.max(1, Math.ceil(sigma * 3));
  // Pairs are spaced to span the WHOLE radius within the tap budget rather than
  // marching outward one texel at a time and stopping early. A σ=26 kernel wants
  // 78 texels of reach; at 32 taps, stepping by two would only reach 62 and drop
  // the tail.
  const pairs = Math.max(1, Math.min(maxTaps - 1, Math.ceil(radius / 2)));
  const step = radius / pairs;

  const offsets = [0];
  const weights = [1];
  // Fold each pair into one bilinear fetch at its weighted midpoint — the
  // standard trick, and what keeps a kernel this wide affordable.
  for (let i = 1; i <= pairs; i += 1) {
    const p = (i - 0.5) * step;
    const q = i * step;
    const a = Math.exp(-(p * p) / (2 * sigma * sigma));
    const b = Math.exp(-(q * q) / (2 * sigma * sigma));
    offsets.push((p * a + q * b) / (a + b));
    weights.push(a + b);
  }

  // Normalise by what is ACTUALLY sampled, not by the ideal infinite Gaussian.
  // Dividing by the full sum while sampling a truncated kernel loses energy and
  // darkens the smear — a small, systematic error that is easy to miss because
  // it looks like "the blur is a bit weaker".
  const used = weights.reduce((sum, w, i) => sum + (i === 0 ? w : 2 * w), 0);
  return {
    offsets,
    weights: weights.map((w) => w / used),
    taps: offsets.length,
  };
};

export interface TrailRendererOptions {
  config: HeroTrailConfig;
  /** Baked DRAG field, and the filter-space region it covers. */
  noise: TexImageSource;
  region: { x: number; y: number; w: number; h: number };
  /** `object-position` X as a fraction, matching the video element's CSS. */
  objectPositionX: number;
  /** Upper bound on device pixel ratio — this effect is fill-bound. */
  maxDpr?: number;
}

export const createTrailRenderer = (
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  options: TrailRendererOptions,
): TrailRenderer | null => {
  const gl = canvas.getContext("webgl2", {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false, // nothing here has a hard edge; MSAA is pure cost
    depth: false, // §7 — nothing depth-tests
    stencil: false,
    powerPreference: "high-performance",
    preserveDrawingBuffer: false,
  });
  if (!gl) return null;

  const c = options.config;
  const programs = {
    displace: link(gl, FRAG_DISPLACE),
    blur: link(gl, FRAG_BLUR),
    composite: link(gl, FRAG_COMPOSITE),
  };
  if (!programs.displace || !programs.blur || !programs.composite) return null;

  const vao = gl.createVertexArray();
  const angle = (c.blur.angle * Math.PI) / 180;
  const axis = { x: Math.cos(angle), y: Math.sin(angle) };
  // The working buffers run at half linear resolution — the same FX_SCALE the
  // SVG rasterised its filter at, so this is not a new concession.
  const WORK_SCALE = 0.5;
  const maxDpr = options.maxDpr ?? 1.5;

  const makeTarget = () => {
    const texture = gl.createTexture();
    const fbo = gl.createFramebuffer();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return { texture, fbo, w: 0, h: 0 };
  };
  const targets = [makeTarget(), makeTarget()];

  const videoTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, videoTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const noiseTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, noiseTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    options.noise,
  );

  let cssW = 0;
  let cssH = 0;
  let half = { x: 1, y: 1 };
  let cover = { x: 0, y: 0, w: 1, h: 1 };
  let kernel = buildBlurKernel(1, 32);
  let lost = false;
  let videoReady = false;

  const onLost = (event: Event) => {
    event.preventDefault();
    lost = true;
  };
  canvas.addEventListener("webglcontextlost", onLost);

  const uniform = (program: WebGLProgram, name: string) =>
    gl.getUniformLocation(program, name);

  let positionX = options.objectPositionX;

  const resize = (width: number, height: number, objectPositionX?: number) => {
    if (lost || width <= 0 || height <= 0) return;
    if (objectPositionX !== undefined) positionX = objectPositionX;
    cssW = width;
    cssH = height;
    const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);

    // The rotated box has to cover the screen box turned by `angle`, or the
    // corners of the smear fall outside the buffer.
    const ax = Math.abs(axis.x);
    const ay = Math.abs(axis.y);
    half = {
      x: (width * ax + height * ay) / 2,
      y: (width * ay + height * ax) / 2,
    };

    const bw = Math.max(1, Math.round(half.x * 2 * WORK_SCALE * dpr));
    const bh = Math.max(1, Math.round(half.y * 2 * WORK_SCALE * dpr));
    for (const target of targets) {
      target.w = bw;
      target.h = bh;
      gl.bindTexture(gl.TEXTURE_2D, target.texture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA8,
        bw,
        bh,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        null,
      );
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        target.texture,
        0,
      );
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // σ is stated in screen px; the blur runs in the work buffer, whose texels
    // span the rotated box.
    const texelsPerScreenPx = bw / (half.x * 2);
    kernel = buildBlurKernel(
      Math.max(0.5, c.blur.along * texelsPerScreenPx),
      32,
    );

    // object-cover, computed once per resize rather than per fragment.
    const vw = video.videoWidth || 16;
    const vh = video.videoHeight || 9;
    const scale = Math.max(width / vw, height / vh);
    const drawW = vw * scale;
    const drawH = vh * scale;
    cover = {
      x: (width - drawW) * positionX,
      y: (height - drawH) * 0.5,
      w: drawW,
      h: drawH,
    };
  };

  const uploadVideo = () => {
    if (video.readyState < 2 || video.videoWidth === 0) return videoReady;
    gl.bindTexture(gl.TEXTURE_2D, videoTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
    videoReady = true;
    return true;
  };

  const draw = (state: TrailFrameState) => {
    if (lost || cssW === 0) return;
    if (!uploadVideo()) return;

    gl.bindVertexArray(vao);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND); // the composite pass is opaque — see its note

    // With no focuses the mask is zero everywhere, and pass 3 returns the base
    // before it ever samples the smear. So the two effect passes are skipped
    // outright: an idle hero costs one textured quad, which is what a `<video>`
    // element costs the compositor anyway.
    const hasTrail = state.focuses.length > 0 && state.opacity > 0;

    if (hasTrail) {
      // --- pass 1: displace, in rotated space -------------------------------
      const p1 = programs.displace!;
      gl.useProgram(p1);
      gl.bindFramebuffer(gl.FRAMEBUFFER, targets[0]!.fbo);
      gl.viewport(0, 0, targets[0]!.w, targets[0]!.h);
      gl.uniform2f(uniform(p1, "uHalfExtent"), half.x, half.y);
      gl.uniform2f(uniform(p1, "uCentre"), cssW / 2, cssH / 2);
      gl.uniform2f(uniform(p1, "uAxis"), axis.x, axis.y);
      gl.uniform4f(uniform(p1, "uCover"), cover.x, cover.y, cover.w, cover.h);
      gl.uniform2f(
        uniform(p1, "uRegionOrigin"),
        options.region.x,
        options.region.y,
      );
      gl.uniform2f(
        uniform(p1, "uRegionSize"),
        options.region.w,
        options.region.h,
      );
      gl.uniform1f(uniform(p1, "uDisplacement"), state.displacement);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, videoTexture);
      gl.uniform1i(uniform(p1, "uVideo"), 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, noiseTexture);
      gl.uniform1i(uniform(p1, "uNoise"), 1);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // --- pass 2: 1-D blur along the (now horizontal) axis ------------------
      const p2 = programs.blur!;
      gl.useProgram(p2);
      gl.bindFramebuffer(gl.FRAMEBUFFER, targets[1]!.fbo);
      gl.viewport(0, 0, targets[1]!.w, targets[1]!.h);
      gl.uniform2f(uniform(p2, "uTexel"), 1 / targets[0]!.w, 1 / targets[0]!.h);
      gl.uniform1i(uniform(p2, "uTaps"), kernel.taps);
      gl.uniform1fv(
        uniform(p2, "uOffsets"),
        new Float32Array(padTo32(kernel.offsets)),
      );
      gl.uniform1fv(
        uniform(p2, "uWeights"),
        new Float32Array(padTo32(kernel.weights)),
      );
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, targets[0]!.texture);
      gl.uniform1i(uniform(p2, "uSource"), 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    // --- pass 3: gate, grade, mask, and the finished picture -----------------
    const p3 = programs.composite!;
    gl.useProgram(p3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);

    gl.uniform2f(uniform(p3, "uHalfExtent"), half.x, half.y);
    gl.uniform2f(uniform(p3, "uCentre"), cssW / 2, cssH / 2);
    gl.uniform2f(uniform(p3, "uAxis"), axis.x, axis.y);
    gl.uniform4f(uniform(p3, "uCover"), cover.x, cover.y, cover.w, cover.h);
    gl.uniform2f(uniform(p3, "uResolution"), cssW, cssH);
    gl.uniform1f(uniform(p3, "uOpacity"), state.opacity);
    gl.uniform1f(uniform(p3, "uSubjectK"), c.color.subjectMask / 100);
    gl.uniform1f(uniform(p3, "uSaturation"), c.color.saturation / 100);
    gl.uniform1f(uniform(p3, "uHueShift"), c.color.hueShift);
    gl.uniform1f(uniform(p3, "uCold"), c.color.coldDarken / 100);

    const count = Math.min(state.focuses.length, GL_MAX_FOCUSES);
    const packed = new Float32Array(GL_MAX_FOCUSES * 4);
    const alphas = new Float32Array(GL_MAX_FOCUSES);
    for (let i = 0; i < count; i += 1) {
      const f = state.focuses[i]!;
      packed[i * 4] = f.x;
      packed[i * 4 + 1] = f.y;
      packed[i * 4 + 2] = f.rx;
      packed[i * 4 + 3] = f.ry;
      alphas[i] = f.alpha;
    }
    gl.uniform1i(uniform(p3, "uFocusCount"), count);
    gl.uniform4fv(uniform(p3, "uFocus"), packed);
    gl.uniform1fv(uniform(p3, "uFocusAlpha"), alphas);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, videoTexture);
    gl.uniform1i(uniform(p3, "uVideo"), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, targets[1]!.texture);
    gl.uniform1i(uniform(p3, "uSmear"), 1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.bindVertexArray(null);
  };

  const dispose = () => {
    canvas.removeEventListener("webglcontextlost", onLost);
    for (const target of targets) {
      gl.deleteTexture(target.texture);
      gl.deleteFramebuffer(target.fbo);
    }
    gl.deleteTexture(videoTexture);
    gl.deleteTexture(noiseTexture);
    gl.deleteVertexArray(vao);
    for (const program of Object.values(programs)) {
      if (program) gl.deleteProgram(program);
    }
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  };

  return { resize, draw, dispose, isLost: () => lost };
};

/** Uniform arrays are fixed-length; pad rather than resize the declaration. */
const padTo32 = (values: readonly number[]) => {
  const out = new Array<number>(32).fill(0);
  for (let i = 0; i < Math.min(32, values.length); i += 1) out[i] = values[i]!;
  return out;
};
