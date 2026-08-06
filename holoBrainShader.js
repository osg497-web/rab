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
  uniform vec3 glowColor;
  uniform vec3 coreColor;
  uniform float time;
  uniform float opacity;

  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec2 vUv;
  varying vec3 vWorldPos;

  void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(vViewDir);

    // fresnel — bright glassy edge, soft dark core (reads as translucent glass/hologram)
    float fresnel = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.4);

    // gentle key light so the gyri/fold geometry still reads as form, not just a flat glow
    float diffuse = max(dot(N, normalize(vec3(0.35, 0.55, 0.75))), 0.0);
    float diffuse2 = max(dot(N, normalize(vec3(-0.4, -0.2, 0.6))), 0.0) * 0.4;

    // extremely subtle internal scan modulation, tied to world space so it doesn't swim with rotation
    float scan = sin(vWorldPos.y * 60.0 + time * 0.6) * 0.02;

    vec3 core = coreColor * (0.10 + diffuse * 0.32 + diffuse2);
    vec3 rim = glowColor * fresnel * 1.6;
    vec3 color = core + rim + scan;

    float alpha = clamp(0.16 + fresnel * 0.62 + diffuse * 0.08, 0.0, 0.94) * opacity;

    gl_FragColor = vec4(color, alpha);
  }
`;
