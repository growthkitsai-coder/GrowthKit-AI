/* ─────────────────────────────────────────────────────────────
   GrowthKit AI — dark-mode hero "threads" (index.html only)

   Vanilla-JS/WebGL port of React Bits' <Threads /> (MIT). The
   original is React + the `ogl` npm package; this repo is a
   no-build, zero-dependency static site, so the shader is kept
   verbatim and the thin runtime (fullscreen triangle, uniforms,
   rAF loop) is written against raw WebGL 1 instead.

   Behavior contract (see docs/design-system.md):
   - Dark mode only: starts/stops as `data-theme` flips on <html>.
   - Fully off under prefers-reduced-motion (hard rule #2).
   - Pure decor: any failure (no WebGL, shader error, context
     loss) silently leaves the hero exactly as it was.
   - Pauses when the hero is off-screen or the tab is hidden.
   Mounts into [data-gk-threads]; mouse is tracked on the parent
   section because the mount itself is pointer-events:none.
   ───────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var mount = document.querySelector('[data-gk-threads]');
  if (!mount || !window.WebGLRenderingContext) return;

  var root = document.documentElement;
  var motion = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* --neon #3EF59F, normalized */
  var COLOR = [62 / 255, 245 / 255, 159 / 255];
  var AMPLITUDE = 0.8;   /* "subtle ambient" — CSS opacity does the rest */
  var DISTANCE = 0.0;
  var MAX_RENDER_DIM = 1920; /* cap internal resolution; shader cost is per-pixel */

  var VERT = [
    'attribute vec2 position;',
    'attribute vec2 uv;',
    'varying vec2 vUv;',
    'void main() {',
    '  vUv = uv;',
    '  gl_Position = vec4(position, 0.0, 1.0);',
    '}'
  ].join('\n');

  /* Fragment shader is byte-for-byte the React Bits original. */
  var FRAG = [
    'precision highp float;',
    'uniform float iTime;',
    'uniform vec3 iResolution;',
    'uniform vec3 uColor;',
    'uniform float uAmplitude;',
    'uniform float uDistance;',
    'uniform vec2 uMouse;',
    '#define PI 3.1415926538',
    'const int u_line_count = 40;',
    'const float u_line_width = 7.0;',
    'const float u_line_blur = 10.0;',
    'float Perlin2D(vec2 P) {',
    '  vec2 Pi = floor(P);',
    '  vec4 Pf_Pfmin1 = P.xyxy - vec4(Pi, Pi + 1.0);',
    '  vec4 Pt = vec4(Pi.xy, Pi.xy + 1.0);',
    '  Pt = Pt - floor(Pt * (1.0 / 71.0)) * 71.0;',
    '  Pt += vec2(26.0, 161.0).xyxy;',
    '  Pt *= Pt;',
    '  Pt = Pt.xzxz * Pt.yyww;',
    '  vec4 hash_x = fract(Pt * (1.0 / 951.135664));',
    '  vec4 hash_y = fract(Pt * (1.0 / 642.949883));',
    '  vec4 grad_x = hash_x - 0.49999;',
    '  vec4 grad_y = hash_y - 0.49999;',
    '  vec4 grad_results = inversesqrt(grad_x * grad_x + grad_y * grad_y)',
    '    * (grad_x * Pf_Pfmin1.xzxz + grad_y * Pf_Pfmin1.yyww);',
    '  grad_results *= 1.4142135623730950;',
    '  vec2 blend = Pf_Pfmin1.xy * Pf_Pfmin1.xy * Pf_Pfmin1.xy',
    '    * (Pf_Pfmin1.xy * (Pf_Pfmin1.xy * 6.0 - 15.0) + 10.0);',
    '  vec4 blend2 = vec4(blend, vec2(1.0 - blend));',
    '  return dot(grad_results, blend2.zxzx * blend2.wwyy);',
    '}',
    'float pixel(float count, vec2 resolution) {',
    '  return (1.0 / max(resolution.x, resolution.y)) * count;',
    '}',
    'float lineFn(vec2 st, float width, float perc, float offset, vec2 mouse, float time, float amplitude, float distance) {',
    '  float split_offset = (perc * 0.4);',
    '  float split_point = 0.1 + split_offset;',
    '  float amplitude_normal = smoothstep(split_point, 0.7, st.x);',
    '  float amplitude_strength = 0.5;',
    '  float finalAmplitude = amplitude_normal * amplitude_strength',
    '    * amplitude * (1.0 + (mouse.y - 0.5) * 0.2);',
    '  float time_scaled = time / 10.0 + (mouse.x - 0.5) * 1.0;',
    '  float blur = smoothstep(split_point, split_point + 0.05, st.x) * perc;',
    '  float xnoise = mix(',
    '    Perlin2D(vec2(time_scaled, st.x + perc) * 2.5),',
    '    Perlin2D(vec2(time_scaled, st.x + time_scaled) * 3.5) / 1.5,',
    '    st.x * 0.3',
    '  );',
    '  float y = 0.5 + (perc - 0.5) * distance + xnoise / 2.0 * finalAmplitude;',
    '  float line_start = smoothstep(',
    '    y + (width / 2.0) + (u_line_blur * pixel(1.0, iResolution.xy) * blur),',
    '    y,',
    '    st.y',
    '  );',
    '  float line_end = smoothstep(',
    '    y,',
    '    y - (width / 2.0) - (u_line_blur * pixel(1.0, iResolution.xy) * blur),',
    '    st.y',
    '  );',
    '  return clamp(',
    '    (line_start - line_end) * (1.0 - smoothstep(0.0, 1.0, pow(perc, 0.3))),',
    '    0.0,',
    '    1.0',
    '  );',
    '}',
    'void main() {',
    '  vec2 uv = gl_FragCoord.xy / iResolution.xy;',
    '  float line_strength = 1.0;',
    '  for (int i = 0; i < u_line_count; i++) {',
    '    float p = float(i) / float(u_line_count);',
    '    line_strength *= (1.0 - lineFn(',
    '      uv,',
    '      u_line_width * pixel(1.0, iResolution.xy) * (1.0 - p),',
    '      p,',
    '      (PI * 1.0) * p,',
    '      uMouse,',
    '      iTime,',
    '      uAmplitude,',
    '      uDistance',
    '    ));',
    '  }',
    '  float colorVal = 1.0 - line_strength;',
    '  gl_FragColor = vec4(uColor * colorVal, colorVal);',
    '}'
  ].join('\n');

  var broken = false; /* permanent bail after an unrecoverable failure */
  var state = null;   /* live instance, or null when stopped */

  function isDark() {
    return root.getAttribute('data-theme') === 'dark';
  }

  function compile(gl, type, src) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  }

  function start() {
    if (state || broken || !isDark() || motion.matches) return;

    var canvas = document.createElement('canvas');
    var gl = canvas.getContext('webgl', {
      alpha: true,
      depth: false,
      antialias: false,
      premultipliedAlpha: false
    });
    if (!gl) { broken = true; return; }

    var vs = compile(gl, gl.VERTEX_SHADER, VERT);
    var fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    var prog = vs && fs ? gl.createProgram() : null;
    if (prog) {
      gl.attachShader(prog, vs);
      gl.attachShader(prog, fs);
      gl.linkProgram(prog);
    }
    if (!prog || !gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      broken = true;
      return;
    }
    gl.useProgram(prog);

    /* Fullscreen triangle (same geometry ogl's Triangle uses). */
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      /* x, y, u, v */
      -1, -1, 0, 0,
       3, -1, 2, 0,
      -1,  3, 0, 2
    ]), gl.STATIC_DRAW);
    var aPos = gl.getAttribLocation(prog, 'position');
    var aUv = gl.getAttribLocation(prog, 'uv');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0);
    if (aUv >= 0) {
      gl.enableVertexAttribArray(aUv);
      gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 16, 8);
    }

    var u = {
      iTime: gl.getUniformLocation(prog, 'iTime'),
      iResolution: gl.getUniformLocation(prog, 'iResolution'),
      uColor: gl.getUniformLocation(prog, 'uColor'),
      uAmplitude: gl.getUniformLocation(prog, 'uAmplitude'),
      uDistance: gl.getUniformLocation(prog, 'uDistance'),
      uMouse: gl.getUniformLocation(prog, 'uMouse')
    };
    gl.uniform3f(u.uColor, COLOR[0], COLOR[1], COLOR[2]);
    gl.uniform1f(u.uAmplitude, AMPLITUDE);
    gl.uniform1f(u.uDistance, DISTANCE);
    gl.uniform2f(u.uMouse, 0.5, 0.5);

    gl.clearColor(0, 0, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    function resize() {
      var w = mount.clientWidth, h = mount.clientHeight;
      if (!w || !h) return;
      var baseDpr = Math.min(window.devicePixelRatio || 1, 2);
      var longest = Math.max(w, h) * baseDpr;
      var dpr = longest > MAX_RENDER_DIM ? (baseDpr * MAX_RENDER_DIM) / longest : baseDpr;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform3f(u.iResolution, canvas.width, canvas.height, canvas.width / canvas.height);
    }

    var ro = new ResizeObserver(resize);
    ro.observe(mount);
    window.addEventListener('resize', resize);
    resize();

    /* Mouse lives on the hero <section>; the mount is pointer-events:none. */
    var hitArea = mount.parentElement || mount;
    var current = [0.5, 0.5], target = [0.5, 0.5];
    function onMove(e) {
      var r = mount.getBoundingClientRect();
      if (!r.width || !r.height) return;
      target[0] = (e.clientX - r.left) / r.width;
      target[1] = 1 - (e.clientY - r.top) / r.height;
    }
    function onLeave() { target[0] = 0.5; target[1] = 0.5; }
    hitArea.addEventListener('mousemove', onMove);
    hitArea.addEventListener('mouseleave', onLeave);

    var visible = true;
    var io = new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
    });
    io.observe(mount);

    var raf = 0;
    function frame(t) {
      raf = requestAnimationFrame(frame);
      if (!visible || document.hidden) return;
      current[0] += 0.05 * (target[0] - current[0]);
      current[1] += 0.05 * (target[1] - current[1]);
      gl.uniform2f(u.uMouse, current[0], current[1]);
      gl.uniform1f(u.iTime, t * 0.001);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    raf = requestAnimationFrame(frame);

    function onLost(e) {
      e.preventDefault();
      cancelAnimationFrame(raf);
    }
    function onRestored() { stop(); start(); }
    canvas.addEventListener('webglcontextlost', onLost);
    canvas.addEventListener('webglcontextrestored', onRestored);

    mount.appendChild(canvas);

    state = {
      teardown: function () {
        cancelAnimationFrame(raf);
        ro.disconnect();
        io.disconnect();
        window.removeEventListener('resize', resize);
        hitArea.removeEventListener('mousemove', onMove);
        hitArea.removeEventListener('mouseleave', onLeave);
        canvas.removeEventListener('webglcontextlost', onLost);
        canvas.removeEventListener('webglcontextrestored', onRestored);
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
        var lose = gl.getExtension('WEBGL_lose_context');
        if (lose) lose.loseContext();
      }
    };
  }

  function stop() {
    if (!state) return;
    state.teardown();
    state = null;
  }

  function sync() {
    if (isDark() && !motion.matches) start();
    else stop();
  }

  new MutationObserver(sync).observe(root, {
    attributes: true,
    attributeFilter: ['data-theme']
  });
  if (motion.addEventListener) motion.addEventListener('change', sync);
  else if (motion.addListener) motion.addListener(sync);

  sync();
})();
