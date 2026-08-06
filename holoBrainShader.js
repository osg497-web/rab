export const holoBrainVertex = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec2 vUv;
  varying vec3 vWorldPos;

  void main() {
    vUv = uv;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;

    vec4 mvPosition = viewMatrix * worldPos;
    vNormal = normalize(mat3(modelMatrix) * normal);
    vViewDir = normalize(cameraPosition - worldPos.xyz);

    gl_Position = projectionMatrix * mvPosition;
  }
`;

export const holoBrainFragment = /* glsl */ `
  uniform vec3 baseColor;
  uniform vec3 glowColor;
  uniform vec3 keyDir;
  uniform vec3 keyColor;
  uniform vec3 rimDir;
  uniform vec3 rimColor;
  uniform float opacity;

  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec2 vUv;
  varying vec3 vWorldPos;

  float random(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
  }

  void main() {
    vec3 N = normalize(vNormal);
    if (!gl_FrontFacing) N = -N;
    vec3 V = normalize(vViewDir);

    // key + rim lighting, fixed — this is what makes gyri pop and sulci go dark.
    // nothing here depends on time, so the base brain never pulses or flickers.
    float diffuseKey = max(dot(N, keyDir), 0.0);
    diffuseKey = pow(diffuseKey, 1.4);
    float diffuseRim = max(dot(N, rimDir), 0.0);

    float fresnel = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 1.8);

    // soft bright zone from above, like the reference's top-left highlight
    float topGlow = smoothstep(-0.2, 1.0, N.y) * 0.35;

    // static horizontal scan bands baked onto the surface — a fixed pattern, not animated
    float scan = sin(vWorldPos.y * 160.0);
    scan = smoothstep(0.15, 0.9, scan);

    // coarse static grain, tied only to UV so it doesn't shimmer over time —
    // this is what makes the surface itself read as a noisy CRT scan, not a clean render
    float n = random(vUv * 500.0);
    float n2 = random(vUv * 140.0 + 11.0);

    vec3 color =
      baseColor * (0.14 + diffuseKey * 0.58 + diffuseRim * 0.22 + topGlow) +
      keyColor * diffuseKey * 0.12 +
      rimColor * fresnel * 0.55 +
      glowColor * scan * 0.14 +
      vec3(n) * 0.16 +
      vec3(n2) * 0.08;

    // gentle posterize — keeps it from reading as a smooth modern gradient render
    color = mix(color, floor(color * 8.0) / 8.0, 0.4);

    gl_FragColor = vec4(color, opacity);
  }
`;
