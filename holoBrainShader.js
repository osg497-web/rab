// Points-based holographic brain: thousands of small self-lit dots instead of
// a solid shaded mesh. Brightness variance is a fixed per-point seed, not
// time-based, so the field never pulses or flickers as a whole.

export const holoPointsVertex = /* glsl */ `
  attribute float aSeed;
  varying float vFresnel;
  varying float vSeed;
  uniform float size;

  void main() {
    vSeed = aSeed;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vec3 n = normalize(normalMatrix * normal);
    vec3 viewDir = normalize(-mvPosition.xyz);
    vFresnel = pow(1.0 - clamp(dot(n, viewDir), 0.0, 1.0), 2.0);

    gl_PointSize = size * (260.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

export const holoPointsFragment = /* glsl */ `
  uniform vec3 baseColor;
  uniform vec3 rimColor;
  varying float vFresnel;
  varying float vSeed;

  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    float soft = smoothstep(0.5, 0.0, d);

    // fixed per-point variance — a static texture of brightness, not an animation
    float variance = 0.7 + 0.3 * fract(sin(vSeed * 91.713) * 4375.234);

    vec3 color = mix(baseColor, rimColor, vFresnel) * variance;
    float alpha = soft * (0.16 + vFresnel * 0.6) * 0.85;

    gl_FragColor = vec4(color, alpha);
  }
`;
