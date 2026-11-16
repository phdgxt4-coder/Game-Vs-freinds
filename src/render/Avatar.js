import * as THREE from 'three';
import { CONFIG } from '../config.js';

/**
 * Player body. Contract used by main.js: `root` (Object3D) and `update(state, yaw)`.
 * A GLTF-based avatar can replace this class by implementing the same two members.
 */
export class Avatar {
  constructor() {
    this.root = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: 0x3a6ea5 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 1.16, 4, 10), mat);
    body.position.y = 0.9; body.castShadow = true;
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.2), new THREE.MeshLambertMaterial({ color: 0x1c2733 }));
    visor.position.set(0, 1.55, -0.28);
    this.root.add(body, visor);
  }
  update(s, yaw) {
    this.root.position.set(s.x, s.y, s.z);
    this.root.rotation.y = yaw;
    this.root.scale.y = s.eye / CONFIG.player.eyeStand; // follows the smoothed crouch height
  }
}
