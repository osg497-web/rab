import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { holoBrainVertex, holoBrainFragment } from './holoBrainShader.js';
import { damp } from './math.js';

const MODEL_URL = './Brain_Model.glb';

export function createHoloMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
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

  // normalize: center at origin, fit to a consistent radius regardless of source scale
  const box = new THREE.Box3().setFromObject(root);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const targetSize = 3.2;
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

  // idle motion state
  let rotY = 0, rotX = 0;
  let targetScrollRotY = 0, curScrollRotY = 0;
  let targetMouseRotY = 0, targetMouseRotX = 0;
  let curMouseRotY = 0, curMouseRotX = 0;
  let targetDragRotY = 0, targetDragRotX = 0;
  let curDragRotY = 0, curDragRotX = 0;

  function addScrollRotation(deltaY) {
    // deltaY > 0 (scroll down) spins one way, < 0 (scroll up) spins the other —
    // this keeps accumulating, it never resets, since the page itself doesn't scroll
    targetScrollRotY += deltaY * 0.0035;
  }

  function addDragRotation(dx, dy) {
    // click-and-drag spin, like grabbing a globe — accumulates just like scroll
    targetDragRotY += dx * 0.006;
    targetDragRotX += dy * 0.006;
  }

  function setMouse(nx, ny) {
    // nx, ny in [-0.5, 0.5] — kept intentionally small: "very subtle parallax"
    targetMouseRotY = nx * 0.22;
    targetMouseRotX = -ny * 0.14;
  }

  function update(dt, t) {
    material.uniforms.time.value = t;

    // gentle continuous idle spin
    rotY += dt * 0.06;

    curScrollRotY = damp(curScrollRotY, targetScrollRotY, 4, dt);
    curMouseRotY = damp(curMouseRotY, targetMouseRotY, 5, dt);
    curMouseRotX = damp(curMouseRotX, targetMouseRotX, 5, dt);
    curDragRotY = damp(curDragRotY, targetDragRotY, 8, dt);
    curDragRotX = damp(curDragRotX, targetDragRotX, 8, dt);

    group.rotation.y = rotY + curScrollRotY + curMouseRotY + curDragRotY;
    group.rotation.x = curMouseRotX + curDragRotX;

    // floating + breathing
    group.position.y = Math.sin(t * 0.55) * 0.14;
    const breath = 1 + Math.sin(t * 0.7) * 0.015;
    group.scale.setScalar(breath);
  }

  return { group, material, update, addScrollRotation, addDragRotation, setMouse };
}
