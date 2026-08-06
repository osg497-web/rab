import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { damp } from './math.js';

const MODEL_URL = './Brain_Model.glb';

export function createHoloMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0x063848,
    emissive: 0x00a8c6,
    emissiveIntensity: 0.35,
    roughness: 0.65,
    metalness: 0.05,
    transparent: true,
    opacity: 0.92,
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

  function setScrollProgress(p) {
    // full slow turn across the scrollable range, eased by damping in update()
    targetScrollRotY = p * Math.PI * 0.9;
  }

  function setMouse(nx, ny) {
    // nx, ny in [-0.5, 0.5] — kept intentionally small: "very subtle parallax"
    targetMouseRotY = nx * 0.22;
    targetMouseRotX = -ny * 0.14;
  }

  function update(dt, t) {
    // gentle continuous idle spin
    rotY += dt * 0.06;

    curScrollRotY = damp(curScrollRotY, targetScrollRotY, 4, dt);
    curMouseRotY = damp(curMouseRotY, targetMouseRotY, 5, dt);
    curMouseRotX = damp(curMouseRotX, targetMouseRotX, 5, dt);

    group.rotation.y = rotY + curScrollRotY + curMouseRotY;
    group.rotation.x = curMouseRotX;

    // floating + breathing
    group.position.y = Math.sin(t * 0.55) * 0.14;
    const breath = 1 + Math.sin(t * 0.7) * 0.015;
    group.scale.setScalar(breath);
  }

  return { group, material, update, setScrollProgress, setMouse };
}
