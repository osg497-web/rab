import * as THREE from 'three';
import { createBrain } from './brain.js';
import { createComposer } from './composer.js';
import { clamp } from './math.js';

export async function initScene({ canvas, loadingEl }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.setClearColor(0x000000, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.7;

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(
    36,
    window.innerWidth / window.innerHeight,
    0.1,
    100
  );
  camera.position.set(0, 0, 7.4);

  // key + rim + fill — no single light washes the whole surface flat
  const keyLight = new THREE.DirectionalLight(0x8cecff, 1.3);
  keyLight.position.set(3, 2, 4);
  const rimLight = new THREE.DirectionalLight(0x00bfff, 1.6);
  rimLight.position.set(-4, 1, -3);
  const fillLight = new THREE.AmbientLight(0x16324a, 0.35);
  scene.add(keyLight, rimLight, fillLight);

  const { composer, setSize, update: updateComposer } = createComposer(renderer, scene, camera);

  const brain = await createBrain(scene, {
    onProgress: (p) => {
      if (loadingEl) loadingEl.textContent = `LOADING BRAIN — ${Math.round(p * 100)}%`;
    },
  });

  if (loadingEl) loadingEl.style.display = 'none';

  // ---- scroll progress (eased inside brain.update via damp) ----
  function getScrollProgress() {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    if (max <= 0) return 0;
    return clamp(window.scrollY / max, 0, 1);
  }
  window.addEventListener('scroll', () => {
    brain.setScrollProgress(getScrollProgress());
  }, { passive: true });

  // ---- subtle mouse parallax ----
  window.addEventListener('mousemove', (e) => {
    const nx = e.clientX / window.innerWidth - 0.5;
    const ny = e.clientY / window.innerHeight - 0.5;
    brain.setMouse(nx, ny);
  });

  function onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    setSize(w, h);
  }
  window.addEventListener('resize', onResize);

  const clock = new THREE.Clock();
  function animate() {
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;

    brain.update(dt, t);
    updateComposer(dt, t);
    composer.render();

    requestAnimationFrame(animate);
  }
  animate();

  return { renderer, scene, camera, brain };
}
