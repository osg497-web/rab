import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { holoBrainVertex, holoBrainFragment } from './holoBrainShader.js';
import { damp } from './math.js';
import { BLOOM_LAYER } from './composer.js';

const MODEL_URL = './Brain_Model.glb';

export function createHoloMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      opacity: { value: 0.97 },
      baseColor: { value: new THREE.Color(0x0b6b86) },
      glowColor: { value: new THREE.Color(0x77eaff) },
      keyDir: { value: new THREE.Vector3(4, 3, 5).normalize() },
      keyColor: { value: new THREE.Color(0x77eaff) },
      rimDir: { value: new THREE.Vector3(-4, 2, -4).normalize() },
      rimColor: { value: new THREE.Color(0x00d9ff) },
    },
    vertexShader: holoBrainVertex,
    fragmentShader: holoBrainFragment,
    transparent: false,
    side: THREE.FrontSide,
  });
}

// ---------------------------------------------------------------------------
// Synapse layer: brainGroup
//                 ├── brainMesh   (static brightness, never animated)
//                 ├── synapsePoints (small sprites, independently fire)
//                 └── pulseLines    (short connective flashes between points)
// ---------------------------------------------------------------------------

function makeGlowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(191,248,255,0.85)');
  g.addColorStop(1, 'rgba(191,248,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function createSynapseSystem(brainGroup, surfacePoints) {
  const glowTex = makeGlowTexture();
  const synapses = [];
  const BASE_SCALE = 0.06;

  const SYNAPSE_COUNT = Math.min(16, surfacePoints.length);
  for (let i = 0; i < SYNAPSE_COUNT; i++) {
    const p = surfacePoints[Math.floor(Math.random() * surfacePoints.length)];
    const material = new THREE.SpriteMaterial({
      map: glowTex,
      color: 0xbff8ff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.copy(p);
    sprite.scale.setScalar(BASE_SCALE);
    sprite.layers.set(BLOOM_LAYER);
    brainGroup.add(sprite);

    synapses.push({
      sprite,
      material,
      position: p,
      state: 'idle',
      t: 0,
      riseDur: 0.1,
      fallDur: 0.3,
      intensity: 0,
    });
  }

  const PULSE_POOL_SIZE = 2;
  const pulsePool = [];
  for (let i = 0; i < PULSE_POOL_SIZE; i++) {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const material = new THREE.LineBasicMaterial({
      color: 0xbff8ff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const line = new THREE.Line(geo, material);
    line.layers.set(BLOOM_LAYER);
    brainGroup.add(line);
    pulsePool.push({ line, geo, material, state: 'idle', t: 0, riseDur: 0.08, fallDur: 0.35 });
  }

  function triggerPulseLine(a, b) {
    const slot = pulsePool.find((p) => p.state === 'idle');
    if (!slot) return;
    const posAttr = slot.geo.attributes.position;
    posAttr.setXYZ(0, a.x, a.y, a.z);
    posAttr.setXYZ(1, b.x, b.y, b.z);
    posAttr.needsUpdate = true;
    slot.state = 'rising';
    slot.t = 0;
  }

  function triggerSynapse(s) {
    s.state = 'rising';
    s.t = 0;
    s.riseDur = 0.1 + Math.random() * 0.1;
    s.fallDur = 0.3 + Math.random() * 0.3;

    if (Math.random() < 0.35) {
      let nearest = null, nearestDist = Infinity;
      for (const other of synapses) {
        if (other === s) continue;
        const d = other.position.distanceToSquared(s.position);
        if (d < nearestDist) { nearestDist = d; nearest = other; }
      }
      if (nearest) triggerPulseLine(s.position, nearest.position);
    }
  }

  function fireRandom() {
    const r = Math.random();
    const count = r < 0.6 ? 1 : r < 0.9 ? 2 : 3;
    for (let i = 0; i < count; i++) {
      const idle = synapses.filter((s) => s.state === 'idle');
      if (!idle.length) break;
      triggerSynapse(idle[Math.floor(Math.random() * idle.length)]);
    }
    const nextDelay = 800 + Math.random() * 1700;
    setTimeout(fireRandom, nextDelay);
  }
  fireRandom();

  function update(dt) {
    for (const s of synapses) {
      if (s.state === 'rising') {
        s.t += dt;
        const p = Math.min(s.t / s.riseDur, 1);
        s.intensity = p * p * (3 - 2 * p);
        if (p >= 1) { s.state = 'falling'; s.t = 0; }
      } else if (s.state === 'falling') {
        s.t += dt;
        const p = Math.min(s.t / s.fallDur, 1);
        s.intensity = 1 - p * p * (3 - 2 * p);
        if (p >= 1) { s.state = 'idle'; s.intensity = 0; }
      }
      s.material.opacity = s.intensity;
      s.sprite.scale.setScalar(BASE_SCALE * (0.8 + s.intensity * 0.9));
    }

    for (const p of pulsePool) {
      if (p.state === 'rising') {
        p.t += dt;
        const k = Math.min(p.t / p.riseDur, 1);
        p.material.opacity = k * 0.85;
        if (k >= 1) { p.state = 'falling'; p.t = 0; }
      } else if (p.state === 'falling') {
        p.t += dt;
        const k = Math.min(p.t / p.fallDur, 1);
        p.material.opacity = 0.85 * (1 - k);
        if (k >= 1) { p.state = 'idle'; p.material.opacity = 0; }
      }
    }
  }

  return { synapses, update };
}

/**
 * Loads the brain GLB, centers + normalizes its scale, and returns a controller
 * with an update(dt, input) function to drive idle/scroll/mouse motion.
 */
export async function createBrain(scene, { onProgress } = {}) {
  const material = createHoloMaterial();
  const group = new THREE.Group();
  scene.add(group);

  const loader = new GLTFLoader();

  const gltf = await new Promise((resolve, reject) => {
    loader.load(
      MODEL_URL,
      resolve,
      (xhr) => {
        if (onProgress && xhr.total) onProgress(xhr.loaded / xhr.total);
      },
      reject
    );
  });

  const root = gltf.scene;

  const box = new THREE.Box3().setFromObject(root);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const isMobile = window.innerWidth <= 640;
  const targetSize = (isMobile ? 3.2 * 0.9 : 3.2) * 1.1;
  const scale = targetSize / maxDim;

  root.traverse((child) => {
    if (child.isMesh) {
      child.material = material;
      child.geometry.computeVertexNormals();
    }
  });

  root.position.sub(center);
  const inner = new THREE.Group();
  inner.add(root);
  inner.scale.setScalar(scale);
  group.add(inner);

  const surfacePoints = [];
  root.traverse((child) => {
    if (child.isMesh) {
      const pos = child.geometry.attributes.position;
      const sampleEvery = Math.max(1, Math.floor(pos.count / 4000));
      for (let i = 0; i < pos.count; i += sampleEvery) {
        const v = new THREE.Vector3().fromBufferAttribute(pos, i);
        v.sub(center).multiplyScalar(scale);
        surfacePoints.push(v);
      }
    }
  });

  const synapseSystem = createSynapseSystem(group, surfacePoints);

  let rotY = 0;
  let targetScrollRotY = 0, curScrollRotY = 0;
  let targetMouseRotY = 0, targetMouseRotX = 0;
  let curMouseRotY = 0, curMouseRotX = 0;
  let targetDragRotY = 0, targetDragRotX = 0;
  let curDragRotY = 0, curDragRotX = 0;

  function addScrollRotation(deltaY) {
    targetScrollRotY += deltaY * 0.0035;
  }

  function setPinProgress(p) {
    // absolute, not accumulating — scrubs deterministically with scroll position
    targetScrollRotY = p * Math.PI * 0.55;
  }

  function addDragRotation(dx, dy) {
    targetDragRotY += dx * 0.006;
    targetDragRotX += dy * 0.006;
  }

  function setMouse(nx, ny) {
    targetMouseRotY = nx * 0.22;
    targetMouseRotX = -ny * 0.14;
  }

  function update(dt, t) {
    rotY += dt * 0.06;

    curScrollRotY = damp(curScrollRotY, targetScrollRotY, 4, dt);
    curMouseRotY = damp(curMouseRotY, targetMouseRotY, 5, dt);
    curMouseRotX = damp(curMouseRotX, targetMouseRotX, 5, dt);
    curDragRotY = damp(curDragRotY, targetDragRotY, 8, dt);
    curDragRotX = damp(curDragRotX, targetDragRotX, 8, dt);

    group.rotation.y = rotY + curScrollRotY + curMouseRotY + curDragRotY;
    group.rotation.x = curMouseRotX + curDragRotX;

    group.position.y = -0.8 + Math.sin(t * 0.55) * 0.14;
    const breath = 1 + Math.sin(t * 0.7) * 0.015;
    group.scale.setScalar(breath);

    synapseSystem.update(dt);
  }

  return { group, material, update, addScrollRotation, setPinProgress, addDragRotation, setMouse };
}
