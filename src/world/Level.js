import * as THREE from 'three';

function checkerTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#6f9a58'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#668f50'; g.fillRect(0, 0, 64, 64); g.fillRect(64, 64, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(60, 60); t.anisotropy = 4;
  return t;
}

/** Movement test range: every traversal mechanic (steps, jumps, crouch tunnel, camera-collision walls) has a dedicated station. */
export function buildTestLevel(scene, world) {
  const geo = new THREE.BoxGeometry(1, 1, 1), mats = new Map();
  const mat = (c) => { let m = mats.get(c); if (!m) mats.set(c, (m = new THREE.MeshLambertMaterial({ color: c }))); return m; };
  const solid = (x0, y0, z0, x1, y1, z1, color) => {
    const m = new THREE.Mesh(geo, mat(color));
    m.scale.set(x1 - x0, y1 - y0, z1 - z0); m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    m.castShadow = m.receiveShadow = true; scene.add(m);
    world.addBox(x0, y0, z0, x1, y1, z1);
  };
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), new THREE.MeshLambertMaterial({ map: checkerTexture() }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

  // Jump / mantle ladder: 0.3 (auto-step) .. 2.2 (needs a ledge)
  [0.3, 0.6, 1.0, 1.4, 2.2].forEach((h, i) => solid(-7 + i * 3.5, 0, -10, -5.4 + i * 3.5, h, -8.4, 0xc98a4b));
  // Stairs (0.3 m risers) leading to a platform
  for (let k = 0; k < 6; k++) solid(14, 0, -12 - 1.2 * (k + 1), 17, 0.3 * (k + 1), -12 - 1.2 * k, 0xb8b2a6);
  solid(14, 0, -25.2, 17, 1.8, -19.2, 0xa59f93);
  // Crouch tunnel: standing height does not fit (roof underside at 1.45 m)
  solid(4, 0, 14, 14, 1.75, 14.4, 0x7c8794); solid(4, 0, 16.6, 14, 1.75, 17, 0x7c8794); solid(4, 1.45, 14, 14, 1.75, 17, 0x66707c);
  // Room with a doorway and roof: third-person camera must not clip through it
  const wall = 0x9aa6b2;
  solid(-26, 0, 6, -21, 3, 6.4, wall); solid(-19, 0, 6, -14, 3, 6.4, wall);
  solid(-26, 0, 17.6, -14, 3, 18, wall); solid(-26, 0, 6.4, -25.6, 3, 17.6, wall); solid(-14.4, 0, 6.4, -14, 3, 17.6, wall);
  solid(-26, 3, 6, -14, 3.3, 18, 0x8c4a3a); solid(-21, 0, 11, -19.5, 3, 12.5, 0x7d8a96);
  // Big wall behind the spawn point for camera-collision testing
  solid(-5, 0, 10, 5, 4, 10.6, 0x8a8f99);
  // Slalom pillars
  for (let i = 0; i < 8; i++) solid(-4 + (i % 2) * 8 - 0.5, 0, -24 - i * 5, -3 + (i % 2) * 8, 4, -23 - i * 5, 0xd8d2c4);
}
