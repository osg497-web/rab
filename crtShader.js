// A restrained CRT pass — meant to read as "vintage monitor", not "cyberpunk glitch".
export const CRTShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    resolution: { value: [1, 1] },
    scanlineIntensity: { value: 0.10 },
    noiseIntensity: { value: 0.035 },
    rgbShift: { value: 0.0012 },
    flicker: { value: 1.0 },
    glitchAmount: { value: 0.0 },
    glitchY: { value: 0.5 },
    vignette: { value: 0.35 },
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
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    void main() {
      vec2 uv = vUv;

      // tiny, rare horizontal glitch displacement near one scanline
      float band = smoothstep(0.0, 0.006, glitchAmount) * step(abs(uv.y - glitchY), 0.01);
      uv.x += band * (hash(vec2(time, uv.y)) - 0.5) * 0.02;

      // very light RGB separation
      float shift = rgbShift * (0.6 + 0.4 * sin(time * 0.7));
      float r = texture2D(tDiffuse, uv + vec2(shift, 0.0)).r;
      float g = texture2D(tDiffuse, uv).g;
      float b = texture2D(tDiffuse, uv - vec2(shift, 0.0)).b;
      vec3 color = vec3(r, g, b);

      // scanlines
      float scan = sin(uv.y * resolution.y * 1.0) * 0.5 + 0.5;
      color -= scan * scanlineIntensity * 0.5;

      // faint VHS grain
      float n = (hash(uv * resolution.xy + time * 60.0) - 0.5) * noiseIntensity;
      color += n;

      // slow, subtle brightness flicker
      color *= flicker;

      // soft vignette
      vec2 centered = uv - 0.5;
      float vig = 1.0 - dot(centered, centered) * vignette;
      color *= vig;

      gl_FragColor = vec4(color, 1.0);
    }
  `,
};
