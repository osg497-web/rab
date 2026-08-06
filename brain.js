import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { holoPointsVertex, holoPointsFragment } from './holoBrainShader.js';
import { damp } from './math.js';
import { BLOOM_LAYER } from './composer.js';

const MODEL_URL = './Brain_Model.glb';

// ---------------------------------------------------------------------------
// brainGroup
//  ├── brainPoints      (holographic particle cloud — the mesh itself, static brightness)
//  ├── pathwayLines      (faint static neural connections between synapse nodes)
//  ├── synapsePoints     (small sprites, independently fire)
//  ├── pulseSprites      (a light travelling along a pathway when a synapse fires)
//  └── ambientParticles  (sparse digital noise drifting around the brain, not across it)
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

function makeFragmentTexture() {
  // a tiny broken-pixel / data-streak sprite for the ambient digital noise
  const c = document.createElement('canvas');
  c.width = 32; c.height = 8;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(191,248,255,0.9)';
  ctx.fillRect(0, 2, 20, 2);
  ctx.fillRect(22, 0, 6, 8);
  return new THREE.CanvasTexture(c);
}

// ---- holographic point-cloud brain ----
function buildBrainPoints(geometry) {
  const count = geometry.attributes.position.count;
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) seeds[i] = Math.random();
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      size: { value: 1.3 },
      baseColor: { value: new THREE.Color(0x0d5a72) },
      rimColor: { value: new THREE.Color(0x8fe9ff) },
    },
    vertexShader: holoPointsVertex,
    fragmentShader: holoPointsFragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });

  return new THREE.Points(geometry, material);
}

// ---- neural pathway network: connect each synapse node to its nearest 2 neighbors ----
function buildPathways(nodePositions) {
  const edges = [];
  const seen = new Set();
  for (let i = 0; i < nodePositions.length; i++) {
    const dists = [];
    for (let j = 0; j < nodePositions.length; j++) {
      if (i === j) continue;
      dists.push([j, nodePositions[i].distanceToSquared(nodePositions[j])]);
    }
    dists.sort((a, b) => a[1] - b[1]);
    for (let k = 0; k < Math.min(2, dists.length); k++) {
      const j = dists[k][0];
      const key = i < j ? `${i}_${j}` : `${j}_${i}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push([i, j]);
    }
  }

  const positions = [];
  for (const [i, j] of edges) {
    positions.push(nodePositions[i].x, nodePositions[i].y, nodePositions[i].z);
    positions.push(nodePositions[j].x, nodePositions[j].y, nodePositions[j].z);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({
    color: 0x1c6e88, transparent: true, opacity: 0.35, depthWrite: false,
  });
  const lines = new THREE.LineSegments(geo, material);
  return { lines, edges };
}

// ---- synapse system: nodes fire rarely & independently, pulses travel along edges ----
function createSynapseSystem(brainGroup, nodePositions, edges) {
  const glowTex = makeGlowTexture();
  const synapses = [];
  const BASE_SCALE = 0.06;

  // adjacency list, built from the pathway edges, for picking a real connected neighbor
  const adjacency = nodePositions.map(() => []);
  for (const [i, j] of edges) { adjacency[i].push(j); adjacency[j].push(i); }

  for (let i = 0; i < nodePositions.length; i++) {
    const material = new THREE.SpriteMaterial({
      map: glowTex, color: 0xbff8ff, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.copy(nodePositions[i]);
    sprite.scale.setScalar(BASE_SCALE);
    sprite.layers.set(BLOOM_LAYER);
    brainGroup.add(sprite);

    synapses.push({
      index: i, sprite, material, position: nodePositions[i],
      state: 'idle', t: 0, riseDur: 0.1, fallDur: 0.3, intensity: 0,
    });
  }

  // a small pool of travelling pulses (light moving from node A to a connected node B)
  const PULSE_POOL_SIZE = 3;
  const pulsePool = [];
  for (let i = 0; i < PULSE_POOL_SIZE; i++) {
    const material = new THREE.SpriteMaterial({
      map: glowTex, color: 0xd8fbff, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.setScalar(BASE_SCALE * 0.8);
    sprite.layers.set(BLOOM_LAYER);
    brainGroup.add(sprite);
    pulsePool.push({ sprite, material, active: false, t: 0, dur: 0.35, from: null, to: null });
  }

  function triggerPulse(fromPos, toPos) {
    const slot = pulsePool.find((p) => !p.active);
    if (!slot) return;
    slot.active = true;
    slot.t = 0;
    slot.dur = 0.28 + Math.random() * 0.18;
    slot.from = fromPos;
    slot.to = toPos;
  }

  function triggerSynapse(s) {
    s.state = 'rising';
    s.t = 0;
    s.riseDur = 0.1 + Math.random() * 0.08;   // 100-180ms
    s.fallDur = 0.3 + Math.random() * 0.2;    // 300-500ms

    const neighbors = adjacency[s.index];
    if (neighbors.length && Math.random() < 0.6) {
      const n = neighbors[Math.floor(Math.random() * neighbors.length)];
      triggerPulse(s.position, nodePositions[n]);
    }
  }

  function fireRandom() {
    const r = Math.random();
    const count = r < 0.65 ? 1 : r < 0.92 ? 2 : 3;
    for (let i = 0; i < count; i++) {
      const idle = synapses.filter((s) => s.state === 'idle');
      if (!idle.length) break;
      triggerSynapse(idle[Math.floor(Math.random() * idle.length)]);
    }
    const nextDelay = 250 + Math.random() * 900; // frequent, but never all at once
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
      if (!p.active) continue;
      p.t += dt;
      const k = Math.min(p.t / p.dur, 1);
      p.sprite.position.lerpVectors(p.from, p.to, k);
      p.material.opacity = Math.sin(Math.PI * k) * 0.95; // rises then falls along the trip
      if (k >= 1) { p.active = false; p.material.opacity = 0; }
    }
  }

  return { synapses, update };
}

// ---- sparse ambient particles / digital fragments drifting around the brain ----
function createAmbientField(brainGroup, radius) {
  const tex = makeFragmentTexture();
  const COUNT = 46;
  const items = [];
  for (let i = 0; i < COUNT; i++) {
    const material = new THREE.SpriteMaterial({
      map: tex, color: 0x9fe9ff, transparent: true,
      opacity: 0.18 + Math.random() * 0.22,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const sprite = new THREE.Sprite(material);
    const dir = new THREE.Vector3(
      Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1
    ).normalize();
    const r = radius * (1.15 + Math.random() * 0.55);
    sprite.position.copy(dir.multiplyScalar(r));
    sprite.scale.setScalar(0.05 + Math.random() * 0.08);
    sprite.material.rotation = Math.random() * Math.PI;
    sprite.layers.set(BLOOM_LAYER);
    brainGroup.add(sprite);
    items.push({
      sprite,
      basePos: sprite.position.clone(),
      phase: Math.random() * Math.PI * 2,
      speed: 0.15 + Math.random() * 0.25,
      amp: 0.04 + Math.random() * 0.06,
    });
  }

  function update(t) {
    for (const it of items) {
      // slow independent drift — positional only, never a brightness flicker
      const off = Math.sin(t * it.speed + it.phase) * it.amp;
      it.sprite.position.set(
        it.basePos.x + off,
        it.basePos.y + Math.cos(t * it.speed * 0.8 + it.phase) * it.amp,
        it.basePos.z + off * 0.6
      );
    }
  }

  return { update };
}

export async function createBrain(scene, { onProgress } = {}) {
  const group = new THREE.Group();
  scene.add(group);

  const loader = new GLTFLoader();
  const gltf = await new Promise((resolve, reject) => {
    loader.load(
      MODEL_URL,
      resolve,
      (xhr) => { if (onProgress && xhr.total) onProgress(xhr.loaded / xhr.total); },
      reject
    );
  });

  const root = gltf.scene;
  const geometries = [];
  root.traverse((child) => {
    if (child.isMesh) {
      child.geometry.computeVertexNormals();
      geometries.push(child.geometry);
    }
  });

  const merged = geometries.length > 1 ? mergeGeometries(geometries, false) : geometries[0];

  merged.computeBoundingBox();
  const box = merged.boundingBox;
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const isMobile = window.innerWidth <= 640;
  const targetSize = isMobile ? 3.2 * 0.9 : 3.2;
  const scale = targetSize / maxDim;

  merged.translate(-center.x, -center.y, -center.z);

  const brainPoints = buildBrainPoints(merged);
  brainPoints.scale.setScalar(scale);
  group.add(brainPoints);

  // sample synapse anchor points directly from the (already centered) merged geometry,
  // scaled into brainGroup space so they sit exactly on the point-cloud surface
  const pos = merged.attributes.position;
  const candidateStep = Math.max(1, Math.floor(pos.count / 6000));
  const candidates = [];
  for (let i = 0; i < pos.count; i += candidateStep) {
    candidates.push(new THREE.Vector3().fromBufferAttribute(pos, i).multiplyScalar(scale));
  }
  const NODE_COUNT = 40;
  const nodePositions = [];
  for (let i = 0; i < NODE_COUNT; i++) {
    nodePositions.push(candidates[Math.floor(Math.random() * candidates.length)].clone());
  }

  const { lines: pathwayLines, edges } = buildPathways(nodePositions);
  group.add(pathwayLines);

  const synapseSystem = createSynapseSystem(group, nodePositions, edges);
  const ambientField = createAmbientField(group, targetSize * 0.5);

  // idle motion state — kept deliberately slow and subtle per spec
  let rotY = 0;
  let targetScrollRotY = 0, curScrollRotY = 0;
  let targetMouseRotY = 0, targetMouseRotX = 0;
  let curMouseRotY = 0, curMouseRotX = 0;
  let targetDragRotY = 0, targetDragRotX = 0;
  let curDragRotY = 0, curDragRotX = 0;

  function addScrollRotation(deltaY) {
    targetScrollRotY += deltaY * 0.0035;
  }

  function addDragRotation(dx, dy) {
    targetDragRotY += dx * 0.006;
    targetDragRotX += dy * 0.006;
  }

  function setMouse(nx, ny) {
    targetMouseRotY = nx * 0.10;  // very subtle
    targetMouseRotX = -ny * 0.06;
  }

  function update(dt, t) {
    rotY += dt * 0.025; // very slow idle spin

    curScrollRotY = damp(curScrollRotY, targetScrollRotY, 4, dt);
    curMouseRotY = damp(curMouseRotY, targetMouseRotY, 5, dt);
    curMouseRotX = damp(curMouseRotX, targetMouseRotX, 5, dt);
    curDragRotY = damp(curDragRotY, targetDragRotY, 8, dt);
    curDragRotX = damp(curDragRotX, targetDragRotX, 8, dt);

    group.rotation.y = rotY + curScrollRotY + curMouseRotY + curDragRotY;
    group.rotation.x = curMouseRotX + curDragRotX;

    // very subtle floating, no breathing scale (kept still, per "calm" brief)
    group.position.y = Math.sin(t * 0.4) * 0.05;

    synapseSystem.update(dt);
    ambientField.update(t);
  }

  return { group, update, addScrollRotation, addDragRotation, setMouse };
}
