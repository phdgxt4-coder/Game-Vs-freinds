import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/** Loads a map GLB into the scene (static: matrices frozen, shadows on). Resolves when the model is in the scene. */
export async function loadMapVisual(gameRenderer, url, onProgress) {
  const gltf = await new GLTFLoader().loadAsync(url, onProgress);
  const aniso = Math.min(4, gameRenderer.renderer.capabilities.getMaxAnisotropy());
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((o) => {
    o.matrixAutoUpdate = false;
    if (!o.isMesh) return;
    o.castShadow = o.receiveShadow = true;
    if (o.material.map) o.material.map.anisotropy = aniso;
  });
  gameRenderer.scene.add(gltf.scene);
  return gltf.scene;
}
