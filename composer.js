import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { CRTShader } from './crtShader.js';

// objects on this layer (synapse sprites, pulse lines) are the ONLY things that
// bloom — the brain body itself stays on the default layer and is never bloomed,
// so its brightness never pulses.
export const BLOOM_LAYER = 1;

const bloomLayerMask = new THREE.Layers();
bloomLayerMask.set(BLOOM_LAYER);

const darkMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
const materialCache = new Map();

function darkenNonBloomed(obj) {
  if (obj.material && bloomLayerMask.test(obj.layers) === false) {
    materialCache.set(obj.uuid, obj.material);
    obj.material = darkMaterial;
  }
}

function restoreMaterial(obj) {
  if (materialCache.has(obj.uuid)) {
    obj.material = materialCache.get(obj.uuid);
    materialCache.delete(obj.uuid);
  }
}

export function createComposer(renderer, scene, camera) {
  const size = new THREE.Vector2();
  renderer.getSize(size);

  // ---- pass 1: render ONLY the bloom-layer objects (synapses/pulses), everything else black ----
  const bloomComposer = new EffectComposer(renderer);
  bloomComposer.renderToScreen = false;
  bloomComposer.addPass(new RenderPass(scene, camera));

  // small, tight bloom — a soft glow around firing points only, not a wash over everything
  const bloomPass = new UnrealBloomPass(size.clone(), 0.30, 0.18, 0.82);
  bloomComposer.addPass(bloomPass);

  // ---- pass 2: normal full-color render, then additively mix in the bloom layer, then CRT ----
  const mixShader = {
    uniforms: {
      tDiffuse: { value: null },
      bloomTexture: { value: bloomComposer.renderTarget2.texture },
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
      uniform sampler2D bloomTexture;
      varying vec2 vUv;
      void main() {
        vec4 base = texture2D(tDiffuse, vUv);
        vec4 bloom = texture2D(bloomTexture, vUv);
        gl_FragColor = base + bloom; // additive — bloom only ever brightens, never dims
      }
    `,
  };

  const finalComposer = new EffectComposer(renderer);
  finalComposer.addPass(new RenderPass(scene, camera));

  const mixPass = new ShaderPass(mixShader);
  finalComposer.addPass(mixPass);

  const crtPass = new ShaderPass(CRTShader);
  crtPass.uniforms.resolution.value = [size.x, size.y];
  crtPass.renderToScreen = true;
  finalComposer.addPass(crtPass);

  function setSize(w, h) {
    bloomComposer.setSize(w, h);
    finalComposer.setSize(w, h);
    crtPass.uniforms.resolution.value = [w, h];
  }

  // very rare, brief glitch — CRT should read as "quietly old", not "malfunctioning"
  let nextGlitch = 8 + Math.random() * 10;

  function update(dt, t) {
    crtPass.uniforms.time.value = t;

    nextGlitch -= dt;
    if (nextGlitch <= 0) {
      crtPass.uniforms.glitchAmount.value = 1.0;
      crtPass.uniforms.glitchY.value = Math.random();
      nextGlitch = 8 + Math.random() * 12;
      setTimeout(() => { crtPass.uniforms.glitchAmount.value = 0.0; }, 70);
    }
  }

  function render() {
    // 1) darken everything except the bloom layer, render the bloom composer
    scene.traverse(darkenNonBloomed);
    bloomComposer.render();
    scene.traverse(restoreMaterial);

    // 2) render the normal full scene, mix in the bloom texture, apply CRT — to screen
    finalComposer.render();
  }

  return { render, setSize, update };
}
