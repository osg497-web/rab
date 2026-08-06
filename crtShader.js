// A restrained CRT pass — meant to read as "vintage monitor", not "cyberpunk glitch".
export const CRTShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    resolution: { value: [1, 1] },
    scanlineIntensity: { value: 0.16 },
    noiseIntensity: { value: 0.05 },
    rgbShift: { value: 0.0014 },
    flicker: { value: 1.0 },
    glitchAmount: { value: 0.0 },
    glitchY: { value: 0.5 },
    vignette: { value: 0.4 },
    curvature: { value: 0.10 },
  },

  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform vec2 resolution;
    uniform float scanlineIntensity;
    uniform float noiseIntensity;
    uniform float rgbShift;
    uniform float flicker;
    uniform float glitchAmount;
    uniform float glitchY;
    uniform float vignette;
    uniform float curvature;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    // classic CRT barrel curvature
    vec2 curveUV(vec2 uv) {
      uv = uv * 2.0 - 1.0;
      vec2 offset = uv.yx * curvature;
      uv = uv + uv * offset * offset;
      return uv * 0.5 + 0.5;
    }

    void main() {
      vec2 uv = curveUV(vUv);

      // outside the curved screen bounds — pure black, sells the CRT glass edge
      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
      }

      // tiny constant horizontal wobble, like analog signal jitter
      uv.x += sin(uv.y * 9.0 + time * 2.4) * 0.0012;

      // rare horizontal glitch displacement near one scanline
      float band = smoothstep(0.0, 0.006, glitchAmount) * step(abs(uv.y - glitchY), 0.012);
      uv.x += band * (hash(vec2(time, uv.y)) - 0.5) * 0.03;

      // very light RGB separation
      float shift = rgbShift * (0.6 + 0.4 * sin(time * 0.7));
      float r = texture2D(tDiffuse, uv + vec2(shift, 0.0)).r;
      float g = texture2D(tDiffuse, uv).g;
      float b = texture2D(tDiffuse, uv - vec2(shift, 0.0)).b;
      vec3 color = vec3(r, g, b);

      // dense, thin scanlines
      float scan = sin(uv.y * resolution.y * 1.5) * 0.5 + 0.5;
      color -= scan * scanlineIntensity * 0.5;

      // fast monochrome grain — this is what reads as "CRT static", not a smooth gradient
      float n = hash(uv * resolution.xy * 0.5 + floor(time * 30.0));
      color += (n - 0.5) * noiseIntensity;

      // slow, subtle brightness flicker + occasional fast micro-flicker
      color *= flicker;

      // soft vignette, stronger toward the curved edges
      vec2 centered = uv - 0.5;
      float vig = 1.0 - dot(centered, centered) * vignette;
      color *= vig;

      // clamp toward blue/cyan only — keeps the whole frame monochrome CRT, not full color
      float lum = dot(color, vec3(0.299, 0.587, 0.114));
      vec3 monoCyan = vec3(lum * 0.55, lum * 0.95, lum * 1.15);
      color = mix(color, monoCyan, 0.35);

      gl_FragColor = vec4(color, 1.0);
    }
  `,
};
