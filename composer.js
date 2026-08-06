import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { CRTShader } from './crtShader.js';

export function createComposer(renderer, scene, camera) {
  const size = new THREE.Vector2();
  renderer.getSize(size);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const bloom = new UnrealBloomPass(size.clone(), 0.45, 0.35, 0.75);
  composer.addPass(bloom);

  const crtPass = new ShaderPass(CRTShader);
  crtPass.uniforms.resolution.value = [size.x, size.y];
  composer.addPass(crtPass);

  function setSize(w, h) {
    composer.setSize(w, h);
    bloom.setSize(w, h);
    crtPass.uniforms.resolution.value = [w, h];
  }

  // gentle ambient flicker + rare tiny glitch — both kept subtle per brief
  let nextGlitch = 3 + Math.random() * 4;

  function update(dt, t) {
    crtPass.uniforms.time.value = t;

    // slow, low-amplitude flicker (never a hard strobe)
    crtPass.uniforms.flicker.value = 1 - 0.02 * (0.5 + 0.5 * Math.sin(t * 3.1)) -
      0.015 * Math.max(0, Math.sin(t * 11.0));

    nextGlitch -= dt;
    if (nextGlitch <= 0) {
      crtPass.uniforms.glitchAmount.value = 1.0;
      crtPass.uniforms.glitchY.value = Math.random();
      nextGlitch = 3 + Math.random() * 5;
      setTimeout(() => { crtPass.uniforms.glitchAmount.value = 0.0; }, 90);
    }
  }

  return { composer, bloom, crtPass, setSize, update };
}
