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
  uniform float time;
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

    // key + rim lighting — this is what actually makes gyri pop and sulci go dark
    float diffuseKey = max(dot(N, keyDir), 0.0);
    diffuseKey = pow(diffuseKey, 1.4);
    float diffuseRim = max(dot(N, rimDir), 0.0);

    // sharp fresnel — cyan only right at the grazing edge
    float fresnel = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 1.8);

    // horizontal scan bands baked directly onto the surface (world space, so they don't swim when it rotates)
    float scan = sin(vWorldPos.y * 160.0 + time * 2.0);
    scan = smoothstep(0.15, 0.9, scan);

    // fast per-pixel grain — reads as CRT static / phosphor grain, not a smooth 3D gradient
    float n = random(vUv * 500.0 + floor(time * 24.0));

    vec3 color =
      baseColor * (0.16 + diffuseKey * 0.62 + diffuseRim * 0.22) +
      keyColor * diffuseKey * 0.12 +
      rimColor * fresnel * 1.05 +
      glowColor * scan * 0.20 +
      vec3(n) * 0.09;

    // gentle posterize — keeps it from reading as a smooth modern gradient render
    color = mix(color, floor(color * 9.0) / 9.0, 0.35);

    gl_FragColor = vec4(color, opacity);
  }
`;
